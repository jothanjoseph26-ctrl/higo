import { ConfigService } from '@nestjs/config';
import { AesService } from './aes.service';

describe('AesService', () => {
  const key = Buffer.alloc(32, 7).toString('base64');
  const config = {
    getOrThrow: (name: string) => {
      if (name === 'ENCRYPTION_KEY') return key;
      throw new Error(`missing ${name}`);
    },
  } as ConfigService;

  it('round-trips encrypt/decrypt', () => {
    const service = new AesService(config);
    const encrypted = service.encrypt('sensitive-nin-value');
    expect(encrypted.ciphertext).not.toContain('sensitive');
    expect(service.decrypt(encrypted)).toBe('sensitive-nin-value');
  });
});