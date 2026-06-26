import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { createWorker, Worker } from 'tesseract.js';
import pdfParse from 'pdf-parse';
import { KycDocType } from '@higo/shared-types';
import { OssService } from '../s3/s3.service';

@Injectable()
export class OcrService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OcrService.name);
  private worker: Worker | null = null;
  private workerReady = false;

  constructor(private readonly oss: OssService) {}

  async onModuleInit(): Promise<void> {
    try {
      this.worker = await createWorker('eng');
      this.workerReady = true;
      this.logger.log('Tesseract OCR worker ready');
    } catch (error) {
      this.logger.warn(
        `Tesseract OCR init failed: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.terminate();
    this.worker = null;
    this.workerReady = false;
  }

  /**
   * Extract structured fields from a KYC document stored in Cloudflare R2.
   * Uses Tesseract.js (open source) for images and pdf-parse for text PDFs.
   */
  async extractForm(
    s3Key: string,
    docType?: KycDocType,
  ): Promise<Record<string, string>> {
    try {
      const presignedUrl = await this.oss.getPresignedUrl(s3Key, 300);
      const response = await fetch(presignedUrl);
      if (!response.ok) {
        this.logger.warn(`Failed to download doc from R2: ${response.status}`);
        return {};
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get('content-type') || 'image/jpeg';

      const text = await this.extractText(buffer, contentType);
      if (!text.trim()) {
        return {};
      }

      return this.parseDocumentFields(text, docType);
    } catch (error) {
      this.logger.warn(
        `OCR failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return {};
    }
  }

  private async extractText(buffer: Buffer, contentType: string): Promise<string> {
    if (contentType.includes('pdf')) {
      return this.extractPdfText(buffer);
    }
    return this.extractImageText(buffer);
  }

  private async extractPdfText(buffer: Buffer): Promise<string> {
    try {
      const parsed = await pdfParse(buffer);
      if (parsed.text?.trim()) {
        return parsed.text;
      }
    } catch (error) {
      this.logger.debug(
        `PDF text extraction failed: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    }
    return this.extractImageText(buffer);
  }

  private async extractImageText(buffer: Buffer): Promise<string> {
    if (!this.workerReady || !this.worker) {
      this.logger.debug('Tesseract worker unavailable; skipping image OCR');
      return '';
    }

    const { data } = await this.worker.recognize(buffer);
    return data.text ?? '';
  }

  private parseDocumentFields(
    text: string,
    docType?: KycDocType,
  ): Record<string, string> {
    const fields: Record<string, string> = {};
    const normalized = text.replace(/\r/g, ' ').replace(/\s+/g, ' ').trim();

    const ninMatch = normalized.match(/\b(\d{11})\b/);
    if (ninMatch) {
      fields.nin = ninMatch[1];
    }

    const nameMatch = normalized.match(
      /(?:FULL\s*NAME|NAME|SURNAME)[:\s]+([A-Z][A-Z\s'.-]{2,60})/i,
    );
    if (nameMatch) {
      fields.name = nameMatch[1].trim();
    }

    const licenseMatch = normalized.match(
      /(?:LICEN[CS]E|LIC\.?)\s*(?:NO|NUMBER)?[:\s#]*([A-Z0-9/-]{5,20})/i,
    );
    if (licenseMatch) {
      fields.licenseNumber = licenseMatch[1].replace(/\s/g, '');
    }

    const plateMatch = normalized.match(
      /\b([A-Z]{2,3}[-\s]?\d{2,3}[-\s]?[A-Z]{2,4})\b/i,
    );
    if (plateMatch) {
      fields.vehiclePlate = plateMatch[1].replace(/\s/g, '-').toUpperCase();
    }

    const insuranceMatch = normalized.match(
      /(?:POLICY|INSURANCE)\s*(?:NO|NUMBER)?[:\s#]*([A-Z0-9/-]{5,25})/i,
    );
    if (insuranceMatch) {
      fields.insuranceNumber = insuranceMatch[1].replace(/\s/g, '');
    }

    if (docType === KycDocType.NIN && fields.nin) {
      fields.documentType = 'nin';
    } else if (docType === KycDocType.DRIVERS_LICENCE && fields.licenseNumber) {
      fields.documentType = 'drivers_licence';
    } else if (docType === KycDocType.VEHICLE_REG && fields.vehiclePlate) {
      fields.documentType = 'vehicle_registration';
    }

    if (Object.keys(fields).length === 0 && normalized.length > 0) {
      fields.rawText = normalized.slice(0, 500);
    }

    return fields;
  }
}