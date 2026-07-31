import { HceCapability, HceRoutingConfig } from './hce.types';

export const HCE_CAPABILITIES: HceCapability[] = [
  'translate',
  'intent_extract',
  'voice_booking',
  'tts',
  'transcribe',
  'landmark',
  'assistant',
];

const FREE_MODEL = 'openrouter/free';

export const DEFAULT_HCE_CONFIG: HceRoutingConfig = {
  enabled: true,
  mockMode: false,
  defaultProvider: 'openrouter',
  defaultModel: FREE_MODEL,
  dailyLimits: {
    passenger: 10,
    driver: 20,
    admin: 50,
    globalOpenRouter: 50,
    azureSttMinutesMonthly: 240,
    azureTtsCharsMonthly: 450000,
  },
  capabilities: {
    translate: {
      provider: 'openrouter',
      model: FREE_MODEL,
      fallbackProvider: 'local',
      fallbackModel: 'phrase-dictionary',
      dailyLimit: 10,
    },
    intent_extract: {
      provider: 'local',
      model: 'keyword-rules',
      fallbackProvider: 'openrouter',
      fallbackModel: FREE_MODEL,
      dailyLimit: 20,
    },
    voice_booking: {
      provider: 'openrouter',
      model: FREE_MODEL,
      fallbackProvider: 'local',
      fallbackModel: 'manual-entry',
      dailyLimit: 10,
    },
    tts: {
      provider: 'local',
      model: 'device-native-or-voice-pack',
      fallbackProvider: 'azure',
      fallbackModel: 'azure-speech-f0',
      dailyLimit: 0,
    },
    transcribe: {
      provider: 'local',
      model: 'device-native',
      fallbackProvider: 'azure',
      fallbackModel: 'azure-speech-f0',
      dailyLimit: 0,
    },
    landmark: {
      provider: 'local',
      model: 'abuja-landmark-db',
      fallbackProvider: 'openrouter',
      fallbackModel: FREE_MODEL,
      dailyLimit: 10,
    },
    assistant: {
      provider: 'openrouter',
      model: FREE_MODEL,
      fallbackProvider: 'local',
      fallbackModel: 'support-template',
      dailyLimit: 10,
    },
  },
  modelRouting: {
    rolloutStage: 'internal',
    paidEnabled: false,
    paidDailyLimit: 50,
    paidDailyBudget: 0,
    freeDailyLimit: 1000,
    allowFreeRouterFallback: true,
    localPhraseOnly: false,
    confidenceThreshold: 0.72,
    maxFreeAttempts: 2,
    features: {
      onboarding: true,
      chat: true,
      smartButtons: true,
      navigation: false,
      offline: true,
    },
    models: [],
    health: {},
  },
};
