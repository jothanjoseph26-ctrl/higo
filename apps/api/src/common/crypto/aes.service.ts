import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

export interface EncryptedBlob {
  iv: string;
  tag: string;
  ciphertext: string;
}

@Injectable()
export class AesService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    this.key = Buffer.from(config.getOrThrow<string>('ENCRYPTION_KEY'), 'base64');
  }

  encrypt(plaintext: string): EncryptedBlob {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return {
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      ciphertext: encrypted.toString('base64'),
    };
  }

  decrypt(blob: EncryptedBlob): string {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(blob.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(blob.tag, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(blob.ciphertext, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }
}