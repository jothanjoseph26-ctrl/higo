import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OssService {
  private readonly logger = new Logger(OssService.name);
  private readonly client: S3Client;
  private readonly defaultBucket: string;

  constructor(config: ConfigService) {
    const accountId = config.getOrThrow<string>('CLOUDFLARE_ACCOUNT_ID');
    if (!accountId || accountId.includes('your_cloudflare')) {
      this.logger.error(
        'CLOUDFLARE_ACCOUNT_ID is a placeholder — set your real Cloudflare account ID on Railway for KYC uploads',
      );
    }
    const accessKeyId = config.getOrThrow<string>('CLOUDFLARE_ACCESS_KEY_ID');
    const secretAccessKey =
      config.get<string>('CLOUDFLARE_SECRET_ACCESS_KEY') ??
      config.getOrThrow<string>('CLOUDFLARE_SECRET_ACESS_KEY');

    const configuredEndpoint = config.get<string>('CLOUDFLARE_R2_ENDPOINT')?.trim();
    const endpoint =
      configuredEndpoint ||
      `https://${accountId}.r2.cloudflarestorage.com`;

    this.defaultBucket = config.getOrThrow<string>('CLOUDFLARE_R2_BUCKET');

    this.client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    });
  }

  async upload(params: {
    bucket?: string;
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<string> {
    const bucket = params.bucket ?? this.defaultBucket;
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: params.key,
          Body: params.body,
          ContentType: params.contentType,
        }),
      );
      return params.key;
    } catch (error) {
      this.logger.error(`R2 upload failed for ${params.key}: ${error}`);
      throw error;
    }
  }

  async getPresignedUrl(
    key: string,
    expiresInSeconds = 3600,
    bucket?: string,
  ): Promise<string> {
    try {
      return getSignedUrl(
        this.client,
        new GetObjectCommand({
          Bucket: bucket ?? this.defaultBucket,
          Key: key,
        }),
        { expiresIn: expiresInSeconds },
      );
    } catch (error) {
      this.logger.error(`R2 presigned URL failed for ${key}: ${error}`);
      throw error;
    }
  }

  async getPresignedUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds = 3600,
    bucket?: string,
  ): Promise<string> {
    try {
      return getSignedUrl(
        this.client,
        new PutObjectCommand({
          Bucket: bucket ?? this.defaultBucket,
          Key: key,
          ContentType: contentType,
        }),
        { expiresIn: expiresInSeconds },
      );
    } catch (error) {
      this.logger.error(`R2 presigned upload URL failed for ${key}: ${error}`);
      throw error;
    }
  }

  async deleteObject(key: string, bucket?: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: bucket ?? this.defaultBucket,
          Key: key,
        }),
      );
    } catch (error) {
      this.logger.error(`R2 delete failed for ${key}: ${error}`);
      throw error;
    }
  }
}