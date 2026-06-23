import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class S3Service {
  private readonly client: S3Client;
  private readonly defaultBucket: string;

  constructor(config: ConfigService) {
    this.client = new S3Client({
      region: config.getOrThrow<string>('AWS_REGION'),
      credentials: {
        accessKeyId: config.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
        secretAccessKey: config.getOrThrow<string>('AWS_SECRET_ACCESS_KEY'),
      },
    });
    this.defaultBucket = config.getOrThrow<string>('AWS_S3_BUCKET_KYC');
  }

  async upload(params: {
    bucket?: string;
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<string> {
    const bucket = params.bucket ?? this.defaultBucket;
    await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: params.key,
        Body: params.body,
        ContentType: params.contentType,
        ServerSideEncryption: 'AES256',
      }),
    );
    return params.key;
  }

  async getPresignedUrl(
    key: string,
    expiresInSeconds = 3600,
    bucket?: string,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: bucket ?? this.defaultBucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async getPresignedUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds = 3600,
    bucket?: string,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: bucket ?? this.defaultBucket,
      Key: key,
      ContentType: contentType,
      ServerSideEncryption: 'AES256',
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async deleteObject(key: string, bucket?: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: bucket ?? this.defaultBucket,
        Key: key,
      }),
    );
  }
}