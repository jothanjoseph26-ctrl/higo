export type HceCapability =
  | 'translate'
  | 'intent_extract'
  | 'voice_booking'
  | 'tts'
  | 'transcribe'
  | 'landmark'
  | 'assistant';

export type HceProvider = 'local' | 'openrouter' | 'azure' | 'mock' | 'disabled';

export type HceLanguage = 'en' | 'pcm' | 'ha' | 'yo' | 'ig';

export interface HceCapabilityConfig {
  provider: HceProvider;
  model: string;
  fallbackProvider: HceProvider;
  fallbackModel: string;
  dailyLimit: number;
}

export interface HceModelConfig {
  modelId: string;
  label?: string;
  enabled: boolean;
  priority: number;
  capabilities: string[];
  supportedCapabilities: string[];
  timeoutMs: number;
  dailyLimit: number;
  isFree: boolean;
  availability: 'available' | 'unavailable' | 'unknown';
  freeStatus: 'free' | 'paid' | 'unknown';
  contextLength?: number;
  lastCheckedAt?: string;
  consecutiveFailures: number;
  disabledReason?: string;
  approvedForRouting: boolean;
}

export interface HceModelHealth {
  modelId: string;
  successCount: number;
  failureCount: number;
  averageLatencyMs: number;
  structuredOutputRate: number;
  cooldownUntil?: string;
  lastError?: string;
}

export interface HceRoutingConfig {
  enabled: boolean;
  mockMode: boolean;
  defaultProvider: HceProvider;
  defaultModel: string;
  dailyLimits: {
    passenger: number;
    driver: number;
    admin: number;
    globalOpenRouter: number;
    azureSttMinutesMonthly: number;
    azureTtsCharsMonthly: number;
  };
  capabilities: Record<HceCapability, HceCapabilityConfig>;
  modelRouting: {
    rolloutStage: 'internal' | 'pilot' | 'general';
    paidEnabled: boolean;
    paidModel?: string;
    paidDailyLimit: number;
    paidDailyBudget: number;
    freeDailyLimit: number;
    allowFreeRouterFallback: boolean;
    localPhraseOnly: boolean;
    confidenceThreshold: number;
    maxFreeAttempts: number;
    features: Record<string, boolean>;
    models: HceModelConfig[];
    health: Record<string, HceModelHealth>;
  };
}

export interface HceRouteDecision {
  allowed: boolean;
  reason?: string;
  provider: HceProvider;
  model: string;
  fallbackProvider: HceProvider;
  fallbackModel: string;
  limit: number;
  used: number;
}

export interface HceIntentResult {
  intent:
    | 'accept'
    | 'decline'
    | 'arrived'
    | 'start_trip'
    | 'end_trip'
    | 'traffic'
    | 'collect_cash'
    | 'call_passenger'
    | 'cancel'
    | 'go_online'
    | 'navigate'
    | 'unclear';
  confidence: number;
  source: 'local_rules' | 'openrouter' | 'fallback';
  entities?: Record<string, unknown>;
}
