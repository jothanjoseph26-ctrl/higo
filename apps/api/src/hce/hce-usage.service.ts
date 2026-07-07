import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AuthUser } from '../common/types/auth-user';
import { HceCapability, HceRouteDecision } from './hce.types';
import { HceSettingsService } from './hce-settings.service';

function dateKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function monthKey(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

function secondsUntilTomorrow(): number {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCHours(24, 0, 0, 0);
  return Math.max(60, Math.floor((tomorrow.getTime() - now.getTime()) / 1000));
}

@Injectable()
export class HceUsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly settings: HceSettingsService,
  ) {}

  async route(user: AuthUser, capability: HceCapability): Promise<HceRouteDecision> {
    const config = await this.settings.getConfig();
    const capabilityConfig = config.capabilities[capability];
    const userLimit = config.dailyLimits[user.type] ?? capabilityConfig.dailyLimit;
    const limit = capabilityConfig.dailyLimit || userLimit;
    const provider = config.mockMode ? 'mock' : capabilityConfig.provider;
    const key = `hce:daily:${dateKey()}:${user.type}:${user.sub}`;
    const current = Number((await this.redis.get(key)) ?? '0');
    const globalKey = `hce:daily:${dateKey()}:provider:${provider}`;
    const globalCurrent = Number((await this.redis.get(globalKey)) ?? '0');

    if (!config.enabled) {
      return {
        allowed: false,
        reason: 'hce_disabled',
        provider,
        model: capabilityConfig.model,
        fallbackProvider: capabilityConfig.fallbackProvider,
        fallbackModel: capabilityConfig.fallbackModel,
        limit,
        used: current,
      };
    }

    if (provider === 'openrouter' && globalCurrent >= config.dailyLimits.globalOpenRouter) {
      return {
        allowed: false,
        reason: 'global_openrouter_daily_limit',
        provider,
        model: capabilityConfig.model,
        fallbackProvider: capabilityConfig.fallbackProvider,
        fallbackModel: capabilityConfig.fallbackModel,
        limit,
        used: current,
      };
    }

    if (limit > 0 && current >= limit) {
      return {
        allowed: false,
        reason: 'user_daily_limit',
        provider,
        model: capabilityConfig.model,
        fallbackProvider: capabilityConfig.fallbackProvider,
        fallbackModel: capabilityConfig.fallbackModel,
        limit,
        used: current,
      };
    }

    return {
      allowed: true,
      provider,
      model: capabilityConfig.model,
      fallbackProvider: capabilityConfig.fallbackProvider,
      fallbackModel: capabilityConfig.fallbackModel,
      limit,
      used: current,
    };
  }

  async consume(user: AuthUser, provider: string): Promise<void> {
    const ttl = secondsUntilTomorrow();
    const userKey = `hce:daily:${dateKey()}:${user.type}:${user.sub}`;
    const userCount = await this.redis.incr(userKey);
    if (userCount === 1) await this.redis.expire(userKey, ttl);
    const providerKey = `hce:daily:${dateKey()}:provider:${provider}`;
    const providerCount = await this.redis.incr(providerKey);
    if (providerCount === 1) await this.redis.expire(providerKey, ttl);
  }

  async getCounters() {
    const config = await this.settings.getConfig();
    const openRouterUsed = Number((await this.redis.get(`hce:daily:${dateKey()}:provider:openrouter`)) ?? '0');
    const azureSttMinutes = Number((await this.redis.get(`hce:monthly:${monthKey()}:azure:stt_minutes`)) ?? '0');
    const azureTtsChars = Number((await this.redis.get(`hce:monthly:${monthKey()}:azure:tts_chars`)) ?? '0');
    const rows = await this.prisma.$queryRaw<Array<{
      total_calls: number;
      cache_hits: number;
      fallbacks: number;
    }>>`
      SELECT
        COUNT(*)::int AS total_calls,
        COUNT(*) FILTER (WHERE cache_hit = true)::int AS cache_hits,
        COUNT(*) FILTER (WHERE fallback_used = true)::int AS fallbacks
      FROM hce_usage_log
      WHERE created_at >= NOW() - INTERVAL '30 days';
    `;
    const row = rows[0] ?? { total_calls: 0, cache_hits: 0, fallbacks: 0 };
    return {
      openRouter: {
        usedToday: openRouterUsed,
        dailyLimit: config.dailyLimits.globalOpenRouter,
      },
      azure: {
        sttMinutesUsedThisMonth: azureSttMinutes,
        sttMinutesMonthlyLimit: config.dailyLimits.azureSttMinutesMonthly,
        ttsCharsUsedThisMonth: azureTtsChars,
        ttsCharsMonthlyLimit: config.dailyLimits.azureTtsCharsMonthly,
      },
      last30Days: {
        totalCalls: row.total_calls,
        cacheHits: row.cache_hits,
        fallbacks: row.fallbacks,
        cacheHitRate: row.total_calls ? row.cache_hits / row.total_calls : 0,
      },
    };
  }

  async log(data: {
    userId: string;
    service: string;
    provider?: string;
    model?: string;
    cacheHit?: boolean;
    fallbackUsed?: boolean;
    success?: boolean;
    tokens?: number;
    durationMs?: number;
  }): Promise<void> {
    const userRows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM users WHERE id = ${data.userId}::uuid
      UNION
      SELECT user_id AS id FROM drivers WHERE id = ${data.userId}::uuid AND user_id IS NOT NULL
      LIMIT 1;
    `;
    const fkUserId = userRows[0]?.id;
    if (!fkUserId) return;

    await this.prisma.$executeRaw`
      INSERT INTO hce_usage_log (
        user_id, service_used, provider, model, cache_hit, fallback_used, success, tokens_consumed, duration_ms
      )
      VALUES (
        ${fkUserId}::uuid,
        ${data.service},
        ${data.provider ?? null},
        ${data.model ?? null},
        ${data.cacheHit ?? false},
        ${data.fallbackUsed ?? false},
        ${data.success ?? true},
        ${data.tokens ?? 0},
        ${data.durationMs ?? 0}
      );
    `;
  }
}
