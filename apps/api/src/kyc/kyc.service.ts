import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import {
  GetKycStatusResponse,
  KYCStatus,
  KycDocType,
  KycDocumentMeta,
  KycRejectionCode,
  KycUploadResponse,
  ReviewKycRequest,
  ReviewKycResponse,
  VerificationTier,
} from '@higo/shared-types';
import { AesService } from '../common/crypto/aes.service';
import { AppException } from '../common/errors/app.exception';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { BackgroundCheckService } from './background-check.service';
import { ComplianceService } from './compliance.service';
import { compressImage, isImageMime } from './image-compression.util';
import {
  applyDocumentUpload,
  applyReviewDecision,
  canReupload,
  computeOverallKycStatus,
  computeVerificationTier,
  KycDocumentsMap,
  REQUIRED_KYC_DOCS,
} from './kyc-state-machine';
import { TextractService } from './textract.service';

const MAX_RAW_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
]);

export interface UploadedKycFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

@Injectable()
export class KYCService {
  private readonly logger = new Logger(KYCService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly aes: AesService,
    private readonly textract: TextractService,
    private readonly compliance: ComplianceService,
    private readonly backgroundCheck: BackgroundCheckService,
  ) {}

  async uploadDocument(
    driverId: string,
    docType: KycDocType,
    file: UploadedKycFile,
  ): Promise<KycUploadResponse> {
    this.validateFile(file);

    let body = file.buffer;
    let contentType = file.mimetype;
    const ext = this.resolveExtension(file);

    if (isImageMime(file.mimetype)) {
      body = await compressImage(file.buffer);
      contentType = 'image/jpeg';
    }

    const timestamp = Date.now();
    const s3Key = `higo-kyc-docs/${driverId}/${docType}/${timestamp}.${ext}`;

    await this.s3.upload({ key: s3Key, body, contentType });

    let ocrFields: Record<string, string> = {};
    try {
      ocrFields = await this.textract.extractForm(s3Key);
    } catch {
      ocrFields = {};
    }

    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) {
      throw new NotFoundException();
    }

    const docs = this.parseDocuments(driver.kycDocuments);
    const previous = docs[docType];

    if (
      previous?.status === KYCStatus.REJECTED &&
      !canReupload(driver.kycStatus as KYCStatus, previous.status)
    ) {
      throw new AppException('VALIDATION_ERROR');
    }

    const meta: KycDocumentMeta = {
      docType,
      s3Key,
      status: KYCStatus.PENDING,
      uploadedAt: new Date().toISOString(),
      ocrFields: Object.keys(ocrFields).length ? ocrFields : undefined,
    };

    const updatedDocs = applyDocumentUpload(docs, meta);
    const kycStatus = computeOverallKycStatus(updatedDocs);
    const verificationTier = computeVerificationTier(updatedDocs);

    const updateData: Prisma.DriverUpdateInput = {
      kycDocuments: updatedDocs as unknown as Prisma.InputJsonValue,
      kycStatus,
      verificationTier,
    };

    if (docType === KycDocType.NIN) {
      const nin = this.extractNin(ocrFields);
      if (nin) {
        updateData.ninEncrypted = this.aes.encrypt(
          nin,
        ) as unknown as Prisma.InputJsonValue;
      }
    }

    await this.prisma.driver.update({
      where: { id: driverId },
      data: updateData,
    });

    await this.compliance.logKycEvent({
      driverId,
      docType,
      action: 'upload',
      actorId: driverId,
      actorType: 'driver',
      metadata: { contentType, sizeBytes: body.length },
    });

    await this.backgroundCheck.initiate(driverId);

    return {
      docType,
      s3Key,
      status: KYCStatus.PENDING,
      ocrFields: Object.keys(ocrFields).length ? ocrFields : undefined,
    };
  }

  async getStatus(driverId: string): Promise<GetKycStatusResponse> {
    const driver = await this.requireDriver(driverId);
    const docs = this.parseDocuments(driver.kycDocuments);

    return {
      kycStatus: driver.kycStatus as KYCStatus,
      verificationTier: driver.verificationTier as VerificationTier,
      documents: REQUIRED_KYC_DOCS.map((docType) => {
        const doc = docs[docType];
        return {
          docType,
          status: doc?.status ?? KYCStatus.PENDING,
          rejectionCode: doc?.rejectionCode,
          rejectionReason: doc?.rejectionReason,
          uploadedAt: doc?.uploadedAt ?? null,
        };
      }),
    };
  }

  async review(
    driverId: string,
    dto: ReviewKycRequest,
    adminId: string,
  ): Promise<ReviewKycResponse> {
    const driver = await this.requireDriver(driverId);
    let docs = this.parseDocuments(driver.kycDocuments);

    for (const item of dto.documents) {
      if (item.decision === 'reject' && !item.rejectionCode) {
        throw new BadRequestException('rejectionCode required when rejecting');
      }

      if (!docs[item.docType]) {
        throw new AppException('VALIDATION_ERROR');
      }

      docs = applyReviewDecision(
        docs,
        item.docType,
        item.decision,
        item.decision === 'reject'
          ? {
              code: item.rejectionCode as KycRejectionCode,
              reason: item.rejectionReason,
            }
          : undefined,
        adminId,
      );

      await this.compliance.logKycEvent({
        driverId,
        docType: item.docType,
        action: item.decision === 'approve' ? 'approve' : 'reject',
        actorId: adminId,
        actorType: 'admin',
        metadata:
          item.decision === 'reject'
            ? { rejectionCode: item.rejectionCode }
            : undefined,
      });
    }

    const kycStatus = computeOverallKycStatus(docs);
    const verificationTier = computeVerificationTier(docs);

    await this.prisma.driver.update({
      where: { id: driverId },
      data: {
        kycDocuments: docs as unknown as Prisma.InputJsonValue,
        kycStatus,
        verificationTier,
      },
    });

    await this.notifyDriverStub(driverId, kycStatus);

    return { driverId, kycStatus, verificationTier };
  }

  async getDocumentUrls(
    driverId: string,
    viewerId: string,
  ): Promise<Array<{ docType: KycDocType; url: string; status: KYCStatus }>> {
    const driver = await this.requireDriver(driverId);
    const docs = this.parseDocuments(driver.kycDocuments);

    await this.compliance.logKycEvent({
      driverId,
      action: 'view',
      actorId: viewerId,
      actorType: 'admin',
    });

    const results: Array<{ docType: KycDocType; url: string; status: KYCStatus }> =
      [];

    for (const docType of REQUIRED_KYC_DOCS) {
      const doc = docs[docType];
      if (!doc?.s3Key) continue;
      const url = await this.s3.getPresignedUrl(doc.s3Key, 3600);
      results.push({ docType, url, status: doc.status });
    }

    return results;
  }

  async recomputeTier(driverId: string): Promise<VerificationTier> {
    const driver = await this.requireDriver(driverId);
    const docs = this.parseDocuments(driver.kycDocuments);
    const tier = computeVerificationTier(docs);
    const kycStatus = computeOverallKycStatus(docs);

    await this.prisma.driver.update({
      where: { id: driverId },
      data: { verificationTier: tier, kycStatus },
    });

    return tier;
  }

  private validateFile(file: UploadedKycFile): void {
    if (!file?.buffer?.length) {
      throw new BadRequestException('file is required');
    }
    if (file.buffer.length > MAX_RAW_BYTES) {
      throw new AppException('DOCUMENT_TOO_LARGE');
    }
    if (!ALLOWED_MIME.has(file.mimetype.toLowerCase())) {
      throw new UnsupportedMediaTypeException('Only PDF, JPG, and PNG are allowed');
    }
  }

  private resolveExtension(file: UploadedKycFile): string {
    if (file.mimetype === 'application/pdf') return 'pdf';
    if (file.mimetype === 'image/png') return 'png';
    return 'jpg';
  }

  private parseDocuments(raw: unknown): KycDocumentsMap {
    if (!raw || typeof raw !== 'object') {
      return {};
    }
    return raw as KycDocumentsMap;
  }

  private async requireDriver(driverId: string) {
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) {
      throw new AppException('NOT_FOUND');
    }
    return driver;
  }

  private extractNin(ocr: Record<string, string>): string | null {
    for (const [key, value] of Object.entries(ocr)) {
      if (/nin/i.test(key) && value.replace(/\D/g, '').length >= 10) {
        return value.replace(/\D/g, '');
      }
    }
    const flat = Object.values(ocr).join(' ');
    const match = flat.match(/\b\d{11}\b/);
    return match?.[0] ?? null;
  }

  private async notifyDriverStub(
    driverId: string,
    status: KYCStatus,
  ): Promise<void> {
    this.logger.log(`KYC review notification stub driver=${driverId} status=${status}`);
    await this.compliance.logKycEvent({
      driverId,
      action: 'notify_driver',
      actorType: 'system',
      metadata: { kycStatus: status },
    });
  }
}