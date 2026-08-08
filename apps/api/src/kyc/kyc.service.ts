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
import { AppException } from '../common/errors/app.exception';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OssService } from '../s3/s3.service';
import { BackgroundCheckService } from './background-check.service';
import { ComplianceService } from './compliance.service';
import { compressImage, isImageMime } from './image-compression.util';
import {
  applyDocumentUpload,
  applyReviewDecision,
  canReupload,
  computeOverallKycStatus,
  computeVerificationTier,
  getRequiredKycDocs,
  KycDocumentsMap,
} from './kyc-state-machine';
import { EmailService } from '../email/email.service';

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
    private readonly s3: OssService,
    private readonly email: EmailService,
    private readonly compliance: ComplianceService,
    private readonly backgroundCheck: BackgroundCheckService,
  ) {}

  async uploadDocument(
    driverId: string,
    docType: KycDocType,
    file: UploadedKycFile,
    identityDocType?: string,
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

    try {
      await this.s3.upload({ key: s3Key, body, contentType });
    } catch (err) {
      this.logger.error(
        `KYC storage upload failed for ${s3Key}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw new AppException(
        'SERVICE_UNAVAILABLE',
        undefined,
        'Document storage is not available. Check CLOUDFLARE_ACCOUNT_ID and R2 credentials on the API service.',
      );
    }

    // OCR auto-fill is disabled: Tesseract's worker thread can't load in this
    // deployment (see main.ts's uncaughtException handler for the known
    // bundling issue), so every upload was paying an 8s dead timeout for a
    // feature that never actually ran. Revisit once the worker bundling is
    // fixed - until then, KYC review is manual (admin reviews the image).
    const ocrFields: Record<string, string> = identityDocType
      ? { identityType: identityDocType }
      : {};

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
    const kycStatus = computeOverallKycStatus(updatedDocs, driver.vehicleType);
    const verificationTier = computeVerificationTier(updatedDocs, driver.vehicleType);

    const updateData: Prisma.DriverUpdateInput = {
      kycDocuments: updatedDocs as unknown as Prisma.InputJsonValue,
      kycStatus,
      verificationTier,
    };

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

    // Recompute tier on-the-fly to prevent staleness from admin bypass
    const computedTier = computeVerificationTier(docs, driver.vehicleType);

    return {
      kycStatus: driver.kycStatus as KYCStatus,
      verificationTier: computedTier,
      // Only report documents that actually exist. KYCStatus has no "not
      // uploaded" member, so a required-but-missing doc was previously
      // defaulting to KYCStatus.PENDING here - indistinguishable from a
      // document that had genuinely been submitted and was awaiting review.
      // That made every brand-new driver's KYC screen show "Pending Review"
      // for documents they'd never uploaded, which also hides the upload
      // button (only shown for "missing"/"rejected"), leaving no way to
      // actually submit anything. Omitting the entry lets the frontend's
      // existing find(...) || "missing" fallback work correctly instead.
      documents: getRequiredKycDocs(driver.vehicleType)
        .map((docType) => {
          const doc = docs[docType];
          if (!doc) return null;
          return {
            docType,
            status: doc.status,
            rejectionCode: doc.rejectionCode,
            rejectionReason: doc.rejectionReason,
            uploadedAt: doc.uploadedAt ?? null,
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null),
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
      // Validated by hand rather than class-validator decorators on the DTO -
      // see kyc.dto.ts's ReviewKycDto for why.
      if (!Object.values(KycDocType).includes(item.docType as KycDocType)) {
        throw new BadRequestException(`invalid docType: ${item.docType}`);
      }
      if (item.decision !== 'approve' && item.decision !== 'reject') {
        throw new BadRequestException(`invalid decision: ${item.decision}`);
      }
      if (item.decision === 'reject' && !item.rejectionCode) {
        throw new BadRequestException('rejectionCode required when rejecting');
      }
      if (
        item.decision === 'reject' &&
        !Object.values(KycRejectionCode).includes(item.rejectionCode as KycRejectionCode)
      ) {
        throw new BadRequestException(`invalid rejectionCode: ${item.rejectionCode}`);
      }

      // Bulk "approve/reject all" sends every possible doc type regardless
      // of vehicle type - a keke driver never uploads license/insurance/
      // roadworthiness at all, so those entries just don't exist here. Skip
      // rather than fail the whole batch over docs that were never required.
      if (!docs[item.docType]) {
        continue;
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

    const kycStatus = computeOverallKycStatus(docs, driver.vehicleType);
    const verificationTier = computeVerificationTier(docs, driver.vehicleType);

    await this.prisma.driver.update({
      where: { id: driverId },
      data: {
        kycDocuments: docs as unknown as Prisma.InputJsonValue,
        kycStatus,
        verificationTier,
      },
    });

    await this.notifyDriver(driverId, kycStatus);

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

    // Iterate every possible doc type, not just this driver's required set -
    // admins should still see docs uploaded before a vehicle-type change, or
    // any doc type at all, without them disappearing from the review screen.
    for (const docType of Object.values(KycDocType)) {
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
    const tier = computeVerificationTier(docs, driver.vehicleType);
    const kycStatus = computeOverallKycStatus(docs, driver.vehicleType);

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

  private async notifyDriver(
    driverId: string,
    status: KYCStatus,
  ): Promise<void> {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      select: { email: true, name: true },
    });

    if (driver?.email) {
      await this.email.sendKycStatusUpdate({
        to: driver.email,
        name: driver.name ?? 'Driver',
        status,
      });
    } else {
      this.logger.log(
        `KYC status updated for driver=${driverId} (${status}); no email on file`,
      );
    }

    await this.compliance.logKycEvent({
      driverId,
      action: 'notify_driver',
      actorType: 'system',
      metadata: { kycStatus: status, emailSent: Boolean(driver?.email) },
    });
  }
}