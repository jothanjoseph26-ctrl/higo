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
