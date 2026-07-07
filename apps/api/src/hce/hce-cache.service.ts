import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HceCacheService {
  constructor(private readonly prisma: PrismaService) {}

  buildKey(service: string, text: string, sourceLanguage?: string, targetLanguage?: string): string {
    const inputHash = createHash('sha256').update(text.trim().toLowerCase()).digest('hex');
    return [service, sourceLanguage ?? 'auto', targetLanguage ?? 'none', inputHash].join(':');
  }

  async get<T>(service: string, text: string, sourceLanguage?: string, targetLanguage?: string): Promise<T | null> {
    const cacheKey = this.buildKey(service, text, sourceLanguage, targetLanguage);
    const rows = await this.prisma.$queryRaw<Array<{ output: T }>>`
      UPDATE hce_cache
      SET hit_count = hit_count + 1, updated_at = NOW()
      WHERE cache_key = ${cacheKey}
      RETURNING output;
    `;
    return rows[0]?.output ?? null;
  }

  async set(
    service: string,
    text: string,
    output: unknown,
    options: { sourceLanguage?: string; targetLanguage?: string; provider?: string; model?: string } = {},
  ): Promise<void> {
    const inputHash = createHash('sha256').update(text.trim().toLowerCase()).digest('hex');
    const cacheKey = this.buildKey(service, text, options.sourceLanguage, options.targetLanguage);
    await this.prisma.$executeRaw`
      INSERT INTO hce_cache (
        cache_key, service, source_language, target_language, input_hash, input_text, output, provider, model
      )
      VALUES (
        ${cacheKey},
        ${service},
        ${options.sourceLanguage ?? null},
        ${options.targetLanguage ?? null},
        ${inputHash},
        ${text},
        ${JSON.stringify(output)}::jsonb,
        ${options.provider ?? null},
        ${options.model ?? null}
      )
      ON CONFLICT (cache_key)
      DO UPDATE SET
        output = EXCLUDED.output,
        provider = EXCLUDED.provider,
        model = EXCLUDED.model,
        updated_at = NOW();
    `;
  }
}
