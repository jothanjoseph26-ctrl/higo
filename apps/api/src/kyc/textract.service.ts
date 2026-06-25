import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OssService } from '../s3/s3.service';

@Injectable()
export class TextractService {
  private readonly logger = new Logger(TextractService.name);
  private readonly region: string;

  constructor(
    private readonly config: ConfigService,
    private readonly oss: OssService,
  ) {
    this.region = this.config.get<string>('VISION_API_REGION', 'ap-southeast-1');
  }

  /**
   * Extract form fields from a document stored in OSS using Alibaba Cloud Vision OCR.
   */
  async extractForm(s3Key: string): Promise<Record<string, string>> {
    try {
      const presignedUrl = await this.oss.getPresignedUrl(s3Key, 300);

      const response = await fetch(presignedUrl);
      if (!response.ok) {
        this.logger.warn(`Failed to download doc from OSS: ${response.status}`);
        return {};
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get('content-type') || 'image/jpeg';

      return await this.callVisionOCR(buffer, contentType);
    } catch (error) {
      this.logger.warn(
        `Vision OCR failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return {};
    }
  }

  private async callVisionOCR(
    fileBuffer: Buffer,
    contentType: string,
  ): Promise<Record<string, string>> {
    // Alibaba Cloud OCR API call
    // Docs: https://www.alibabacloud.com/help/en/ocr/api-overview
    //
    // When credentials are provisioned, implement using:
    //   - RecognizeGeneral / RecognizeIDCard for general OCR
    //   - RecognizeDriverLicense for NIN slip
    //   - POST to ocr-api.{region}.aliyuncs.com with base64 body
    //
    // For now, return empty - will be wired when Vision API is live
    this.logger.log('Vision OCR called - awaiting Alibaba Cloud Vision API credentials');
    return {};
  }
}
