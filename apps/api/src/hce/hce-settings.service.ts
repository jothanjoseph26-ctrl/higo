import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_HCE_CONFIG, HCE_CAPABILITIES } from './hce-defaults';
import {
  HceCapability,
  HceCapabilityConfig,
  HceModelConfig,
  HceModelHealth,
  HceRoutingConfig,
} from './hce.types';

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

function parseModelConfig(raw: unknown): HceModelConfig | null {
  const data = isObject(raw) ? raw : {};
  const modelId = typeof data.modelId === 'string'
    ? data.modelId
    : typeof data.model_id === 'string'
      ? data.model_id
      : null;
  if (!modelId) return null;

  const capabilities = Array.isArray(data.capabilities) ? data.capabilities.map(String) : [];
  const supportedCapabilities = Array.isArray(data.supportedCapabilities)
    ? data.supportedCapabilities.map(String)
    : Array.isArray(data.supported_capabilities)
      ? data.supported_capabilities.map(String)
      : capabilities;

  return {
    modelId,
    label: typeof data.label === 'string' ? data.label : undefined,
    enabled: typeof data.enabled === 'boolean' ? data.enabled : true,
    priority: typeof data.priority === 'number' ? data.priority : 100,
    capabilities,
    supportedCapabilities,
    timeoutMs:
      typeof data.timeoutMs === 'number'
        ? data.timeoutMs
        : typeof data.timeout_ms === 'number'
          ? data.timeout_ms
          : 10000,
    dailyLimit:
      typeof data.dailyLimit === 'number'
        ? data.dailyLimit
        : typeof data.daily_limit === 'number'
          ? data.daily_limit
          : 500,
    isFree:
      typeof data.isFree === 'boolean'
        ? data.isFree
        : typeof data.is_free === 'boolean'
          ? data.is_free
          : true,
    availability:
      data.availability === 'available' || data.availability === 'unavailable'
        ? data.availability
        : 'unknown',
    freeStatus:
      data.freeStatus === 'free' || data.freeStatus === 'paid'
        ? data.freeStatus
        : data.free_status === 'free' || data.free_status === 'paid'
          ? data.free_status
          : 'unknown',
    contextLength:
      typeof data.contextLength === 'number'
        ? data.contextLength
        : typeof data.context_length === 'number'
          ? data.context_length
          : undefined,
    lastCheckedAt:
      typeof data.lastCheckedAt === 'string'
        ? data.lastCheckedAt
        : typeof data.last_checked_at === 'string'
          ? data.last_checked_at
          : undefined,
    consecutiveFailures:
      typeof data.consecutiveFailures === 'number'
        ? data.consecutiveFailures
        : typeof data.consecutive_failures === 'number'
          ? data.consecutive_failures
          : 0,
    disabledReason:
      typeof data.disabledReason === 'string'
        ? data.disabledReason
        : typeof data.disabled_reason === 'string'
          ? data.disabled_reason
          : undefined,
    approvedForRouting:
      typeof data.approvedForRouting === 'boolean'
        ? data.approvedForRouting
        : typeof data.approved_for_routing === 'boolean'
          ? data.approved_for_routing
          : true,
  };
}

function parseModelHealth(raw: unknown, modelId: string): HceModelHealth {
  const data = isObject(raw) ? raw : {};
  return {
    modelId,
    successCount:
      typeof data.successCount === 'number'
        ? data.successCount
        : typeof data.success_count === 'number'
          ? data.success_count
          : 0,
    failureCount:
      typeof data.failureCount === 'number'
        ? data.failureCount
        : typeof data.failure_count === 'number'
          ? data.failure_count
          : 0,
    averageLatencyMs:
      typeof data.averageLatencyMs === 'number'
        ? data.averageLatencyMs
        : typeof data.average_latency_ms === 'number'
          ? data.average_latency_ms
          : 0,
    structuredOutputRate:
      typeof data.structuredOutputRate === 'number'
        ? data.structuredOutputRate
        : typeof data.structured_output_rate === 'number'
          ? data.structured_output_rate
          : 1,
    cooldownUntil:
      typeof data.cooldownUntil === 'string'
        ? data.cooldownUntil
        : typeof data.cooldown_until === 'string'
          ? data.cooldown_until
          : undefined,
    lastError:
      typeof data.lastError === 'string'
        ? data.lastError
        : typeof data.last_error === 'string'
          ? data.last_error
          : undefined,
  };
}

export function parseHceConfig(raw: unknown): HceRoutingConfig {
  const data = isObject(raw) ? raw : {};
  const limits = isObject(data.dailyLimits) ? data.dailyLimits : {};
  const capabilities = isObject(data.capabilities) ? data.capabilities : {};
  const routing = isObject(data.modelRouting)
    ? data.modelRouting
    : isObject(data.model_routing)
      ? data.model_routing
      : {};
  const health = isObject(routing.health) ? routing.health : {};
  const modelRows = Array.isArray(routing.models) ? routing.models : [];

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
    modelRouting: {
      rolloutStage:
        routing.rolloutStage === 'pilot' || routing.rolloutStage === 'general'
          ? routing.rolloutStage
          : routing.rollout_stage === 'pilot' || routing.rollout_stage === 'general'
            ? routing.rollout_stage
            : DEFAULT_HCE_CONFIG.modelRouting.rolloutStage,
      paidEnabled:
        typeof routing.paidEnabled === 'boolean'
          ? routing.paidEnabled
          : typeof routing.paid_enabled === 'boolean'
            ? routing.paid_enabled
            : DEFAULT_HCE_CONFIG.modelRouting.paidEnabled,
      paidModel:
        typeof routing.paidModel === 'string'
          ? routing.paidModel
          : typeof routing.paid_model === 'string'
            ? routing.paid_model
            : undefined,
      paidDailyLimit:
        typeof routing.paidDailyLimit === 'number'
          ? routing.paidDailyLimit
          : typeof routing.paid_daily_limit === 'number'
            ? routing.paid_daily_limit
            : DEFAULT_HCE_CONFIG.modelRouting.paidDailyLimit,
      paidDailyBudget:
        typeof routing.paidDailyBudget === 'number'
          ? routing.paidDailyBudget
          : typeof routing.paid_daily_budget === 'number'
            ? routing.paid_daily_budget
            : DEFAULT_HCE_CONFIG.modelRouting.paidDailyBudget,
      freeDailyLimit:
        typeof routing.freeDailyLimit === 'number'
          ? routing.freeDailyLimit
          : typeof routing.free_daily_limit === 'number'
            ? routing.free_daily_limit
            : DEFAULT_HCE_CONFIG.modelRouting.freeDailyLimit,
      allowFreeRouterFallback:
        typeof routing.allowFreeRouterFallback === 'boolean'
          ? routing.allowFreeRouterFallback
          : typeof routing.allow_free_router_fallback === 'boolean'
            ? routing.allow_free_router_fallback
            : DEFAULT_HCE_CONFIG.modelRouting.allowFreeRouterFallback,
      localPhraseOnly:
        typeof routing.localPhraseOnly === 'boolean'
          ? routing.localPhraseOnly
          : typeof routing.local_phrase_only === 'boolean'
            ? routing.local_phrase_only
            : DEFAULT_HCE_CONFIG.modelRouting.localPhraseOnly,
      confidenceThreshold:
        typeof routing.confidenceThreshold === 'number'
          ? routing.confidenceThreshold
          : typeof routing.confidence_threshold === 'number'
            ? routing.confidence_threshold
            : DEFAULT_HCE_CONFIG.modelRouting.confidenceThreshold,
      maxFreeAttempts:
        typeof routing.maxFreeAttempts === 'number'
          ? routing.maxFreeAttempts
          : typeof routing.max_free_attempts === 'number'
            ? routing.max_free_attempts
            : DEFAULT_HCE_CONFIG.modelRouting.maxFreeAttempts,
      features: isObject(routing.features)
        ? Object.fromEntries(
            Object.entries(routing.features).map(([key, value]) => [key, Boolean(value)]),
          )
        : DEFAULT_HCE_CONFIG.modelRouting.features,
      models: modelRows.map(parseModelConfig).filter(Boolean) as HceModelConfig[],
      health: Object.fromEntries(
        Object.entries(health).map(([modelId, value]) => [
          modelId,
          parseModelHealth(value, modelId),
        ]),
      ),
    },
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
