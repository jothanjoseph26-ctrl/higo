import OSS from 'ali-oss';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OssService {
  private readonly logger = new Logger(OssService.name);
  private readonly client: OSS;
  private readonly defaultBucket: string;
  private readonly region: string;

  constructor(config: ConfigService) {
    this.region = config.getOrThrow<string>('ALIBABA_CLOUD_REGION');
    this.defaultBucket = config.getOrThrow<string>('ALIBABA_CLOUD_OSS_BUCKET');

    this.client = new OSS({
      region: this.region,
      accessKeyId: config.getOrThrow<string>('ALIBABA_CLOUD_ACCESS_KEY_ID'),
      accessKeySecret: config.getOrThrow<string>('ALIBABA_CLOUD_ACCESS_KEY_SECRET'),
      bucket: this.defaultBucket,
      endpoint: config.get<string>('ALIBABA_CLOUD_OSS_ENDPOINT'),
      secure: true,
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
      const client = params.bucket
        ? this.client.useBucket(params.bucket)
        : this.client;

      await client.put(params.key, params.body, {
        headers: {
          'Content-Type': params.contentType,
          'x-oss-server-side-encryption': 'AES256',
        },
      });

      return params.key;
    } catch (error) {
      this.logger.error(`OSS upload failed for ${params.key}: ${error}`);
      throw error;
    }
  }

  async getPresignedUrl(
    key: string,
    expiresInSeconds = 3600,
    bucket?: string,
  ): Promise<string> {
    try {
      const client = bucket ? this.client.useBucket(bucket) : this.client;
      return client.signatureUrl(key, {
        expires: expiresInSeconds,
        method: 'GET',
      });
    } catch (error) {
      this.logger.error(`OSS presigned URL failed for ${key}: ${error}`);
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
      const client = bucket ? this.client.useBucket(bucket) : this.client;
      return client.signatureUrl(key, {
        expires: expiresInSeconds,
        method: 'PUT',
        'Content-Type': contentType,
        'x-oss-server-side-encryption': 'AES256',
      });
    } catch (error) {
      this.logger.error(`OSS presigned upload URL failed for ${key}: ${error}`);
      throw error;
    }
  }

  async deleteObject(key: string, bucket?: string): Promise<void> {
    try {
      const client = bucket ? this.client.useBucket(bucket) : this.client;
      await client.delete(key);
    } catch (error) {
      this.logger.error(`OSS delete failed for ${key}: ${error}`);
      throw error;
    }
  }
}
