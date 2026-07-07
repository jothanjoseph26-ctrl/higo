import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_HCE_CONFIG, HCE_CAPABILITIES } from './hce-defaults';
import { HceCapability, HceCapabilityConfig, HceRoutingConfig } from './hce.types';

const PLATFORM_SETTINGS_ID = 'default';

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseCapability(raw: unknown, fallback: HceCapabilityConfig): HceCapabilityConfig {
  const data = isObject(raw) ? raw : {};
  return {
    provider: typeof data.provider === 'string' ? (data.provider as any) : fallback.provider,
    model: typeof data.model === 'string' ? data.model : fallback.model,
    fallbackProvider:
      typeof data.fallbackProvider === 'string' ? (data.fallbackProvider as any) : fallback.fallbackProvider,
    fallbackModel: typeof data.fallbackModel === 'string' ? data.fallbackModel : fallback.fallbackModel,
    dailyLimit: typeof data.dailyLimit === 'number' ? data.dailyLimit : fallback.dailyLimit,
  };
}

export function parseHceConfig(raw: unknown): HceRoutingConfig {
  const data = isObject(raw) ? raw : {};
  const limits = isObject(data.dailyLimits) ? data.dailyLimits : {};
  const capabilities = isObject(data.capabilities) ? data.capabilities : {};

  return {
    enabled: typeof data.enabled === 'boolean' ? data.enabled : DEFAULT_HCE_CONFIG.enabled,
    mockMode: typeof data.mockMode === 'boolean' ? data.mockMode : DEFAULT_HCE_CONFIG.mockMode,
    defaultProvider:
      typeof data.defaultProvider === 'string' ? (data.defaultProvider as any) : DEFAULT_HCE_CONFIG.defaultProvider,
    defaultModel: typeof data.defaultModel === 'string' ? data.defaultModel : DEFAULT_HCE_CONFIG.defaultModel,
    dailyLimits: {
      passenger: typeof limits.passenger === 'number' ? limits.passenger : DEFAULT_HCE_CONFIG.dailyLimits.passenger,
      driver: typeof limits.driver === 'number' ? limits.driver : DEFAULT_HCE_CONFIG.dailyLimits.driver,
      admin: typeof limits.admin === 'number' ? limits.admin : DEFAULT_HCE_CONFIG.dailyLimits.admin,
      globalOpenRouter:
        typeof limits.globalOpenRouter === 'number'
          ? limits.globalOpenRouter
          : DEFAULT_HCE_CONFIG.dailyLimits.globalOpenRouter,
      azureSttMinutesMonthly:
        typeof limits.azureSttMinutesMonthly === 'number'
          ? limits.azureSttMinutesMonthly
          : DEFAULT_HCE_CONFIG.dailyLimits.azureSttMinutesMonthly,
      azureTtsCharsMonthly:
        typeof limits.azureTtsCharsMonthly === 'number'
          ? limits.azureTtsCharsMonthly
          : DEFAULT_HCE_CONFIG.dailyLimits.azureTtsCharsMonthly,
    },
    capabilities: Object.fromEntries(
      HCE_CAPABILITIES.map((capability) => [
        capability,
        parseCapability(capabilities[capability], DEFAULT_HCE_CONFIG.capabilities[capability]),
      ]),
    ) as Record<HceCapability, HceCapabilityConfig>,
  };
}

@Injectable()
export class HceSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig(): Promise<HceRoutingConfig> {
    const row = await this.prisma.platformSettings.findUnique({
      where: { id: PLATFORM_SETTINGS_ID },
    });
    const settings = isObject(row?.settings) ? row?.settings : {};
    return parseHceConfig(settings.hce);
  }
}
