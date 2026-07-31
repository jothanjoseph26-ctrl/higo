import { Injectable } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { AppException } from '../common/errors/app.exception';
import { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { HceCacheService } from './hce-cache.service';
import { PHRASE_DICTIONARY, VOICE_PACK_MANIFEST, findPhraseTranslation, normalizeText } from './phrase-dictionary';
import { HceIntentResult, HceLanguage } from './hce.types';
import { HceUsageService } from './hce-usage.service';

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  pcm: 'Nigerian Pidgin',
  ha: 'Hausa',
  yo: 'Yoruba',
  ig: 'Igbo',
};

const INTENT_RULES: Array<{ intent: HceIntentResult['intent']; phrases: string[] }> = [
  { intent: 'accept', phrases: ['accept', 'yes', 'karba', 'gba', 'confirm'] },
  { intent: 'decline', phrases: ['decline', 'no', 'ki', 'ko', 'reject'] },
  { intent: 'arrived', phrases: ['arrived', 'i am here', 'i have arrived', 'na iso', 'mo ti de', 'i don reach'] },
  { intent: 'start_trip', phrases: ['start trip', 'begin trip', 'fara tafiya', 'bere irin ajo'] },
  { intent: 'end_trip', phrases: ['end trip', 'complete trip', 'kare tafiya', 'pari irin ajo'] },
  { intent: 'traffic', phrases: ['traffic', 'go slow', 'cunkoso', 'ona di'] },
  { intent: 'collect_cash', phrases: ['collect cash', 'cash', 'karbi kudi', 'gba owo'] },
  { intent: 'call_passenger', phrases: ['call passenger', 'phone passenger', 'kira fasinja', 'pe ero'] },
  { intent: 'cancel', phrases: ['cancel', 'cancel ride', 'soke', 'fagile'] },
  { intent: 'go_online', phrases: ['go online', 'online'] },
  { intent: 'navigate', phrases: ['navigate', 'directions', 'map', 'show road'] },
];

function languageOrDefault(value?: string): HceLanguage {
  return value === 'pcm' || value === 'ha' || value === 'yo' || value === 'ig' ? value : 'en';
}

function tokenEstimate(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

@Injectable()
export class HceService {
  constructor(
    private readonly ai: AiService,
    private readonly cache: HceCacheService,
    private readonly usage: HceUsageService,
    private readonly prisma: PrismaService,
  ) {}

  localIntent(text: string): HceIntentResult {
    const normalized = normalizeText(text);
    for (const rule of INTENT_RULES) {
      if (rule.phrases.some((phrase) => normalized.includes(phrase))) {
        return { intent: rule.intent, confidence: 1, source: 'local_rules' };
      }
    }
    return { intent: 'unclear', confidence: 0, source: 'fallback' };
  }

  async translate(user: AuthUser, dto: { text: string; targetLanguage: string; sourceLanguage?: string }) {
    const started = Date.now();
    const targetLanguage = languageOrDefault(dto.targetLanguage);
    const sourceLanguage = dto.sourceLanguage ?? 'auto';
    const cached = await this.cache.get<any>('translate', dto.text, sourceLanguage, targetLanguage);
    if (cached) {
      await this.usage.log({
        userId: user.sub,
        service: 'translate',
        provider: cached.provider ?? 'cache',
        model: cached.model ?? 'cache',
        cacheHit: true,
        durationMs: Date.now() - started,
      });
      return { ...cached, cacheHit: true };
    }

    const phrase = findPhraseTranslation(dto.text, targetLanguage);
    if (phrase) {
      const result = {
        translatedText: phrase.translatedText,
        sourceLanguage,
        targetLanguage,
        provider: 'local',
        model: 'phrase-dictionary',
        cacheHit: false,
        fallbackUsed: false,
      };
      await this.cache.set('translate', dto.text, result, {
        sourceLanguage,
        targetLanguage,
        provider: 'local',
        model: 'phrase-dictionary',
      });
      await this.usage.log({
        userId: user.sub,
        service: 'translate',
        provider: 'local',
        model: 'phrase-dictionary',
        durationMs: Date.now() - started,
      });
      return result;
    }

    const route = await this.usage.route(user, 'translate');
    if (!route.allowed || route.provider !== 'openrouter') {
      const result = {
        translatedText: dto.text,
        sourceLanguage,
        targetLanguage,
        provider: route.fallbackProvider,
        model: route.fallbackModel,
        cacheHit: false,
        fallbackUsed: true,
        limitReason: route.reason,
      };
      await this.usage.log({
        userId: user.sub,
        service: 'translate',
        provider: route.fallbackProvider,
        model: route.fallbackModel,
        fallbackUsed: true,
        success: false,
        durationMs: Date.now() - started,
      });
      return result;
    }

    await this.usage.consume(user, 'openrouter');
    const translatedText = await this.ai.prompt(
      'You translate short ride-hailing messages for Nigerian users. Return only the translated sentence.',
      `Translate this message to ${LANGUAGE_NAMES[targetLanguage] ?? targetLanguage}: ${dto.text}`,
      { model: route.model, temperature: 0.1, maxTokens: 120 },
    );
    const result = {
      translatedText: translatedText || dto.text,
      sourceLanguage,
      targetLanguage,
      provider: 'openrouter',
      model: route.model,
      cacheHit: false,
      fallbackUsed: !translatedText,
    };
    await this.cache.set('translate', dto.text, result, {
      sourceLanguage,
      targetLanguage,
      provider: 'openrouter',
      model: route.model,
    });
    await this.usage.log({
      userId: user.sub,
      service: 'translate',
      provider: 'openrouter',
      model: route.model,
      fallbackUsed: !translatedText,
      success: Boolean(translatedText),
      tokens: tokenEstimate(dto.text),
      durationMs: Date.now() - started,
    });
    return result;
  }

  async transcribe(user: AuthUser, dto: { transcript?: string; languageHint?: string }) {
    const started = Date.now();
    const text = dto.transcript?.trim() ?? '';
    await this.usage.log({
      userId: user.sub,
      service: 'transcribe',
      provider: text ? 'local' : 'azure',
      model: text ? 'device-native' : 'azure-speech-f0',
      fallbackUsed: !text,
      success: Boolean(text),
      durationMs: Date.now() - started,
    });
    return {
      text,
      language: languageOrDefault(dto.languageHint),
      confidence: text ? 1 : 0,
      provider: text ? 'local' : 'azure',
      model: text ? 'device-native' : 'azure-speech-f0',
      fallback: text ? null : 'native_transcript_required',
    };
  }

  async speak(user: AuthUser, dto: { text: string; language: string; voiceGender?: 'male' | 'female' }) {
    const started = Date.now();
    const language = languageOrDefault(dto.language);
    const phrase = findPhraseTranslation(dto.text, language);
    await this.usage.log({
      userId: user.sub,
      service: 'speak',
      provider: 'local',
      model: phrase ? 'voice-pack' : 'device-native',
      durationMs: Date.now() - started,
    });
    return {
      audioUrl: null,
      durationMs: 0,
      text: phrase?.translatedText ?? dto.text,
      language,
      provider: 'local',
      model: phrase ? 'voice-pack' : 'device-native',
      fallback: 'client_device_tts',
    };
  }

  async voiceNote(
    user: AuthUser,
    dto: { text?: string; transcript?: string; targetLanguage: string; sourceLanguage?: string },
  ) {
    const originalText = `${dto.text ?? ''} ${dto.transcript ?? ''}`.trim();
    const translation = await this.translate(user, {
      text: originalText,
      sourceLanguage: dto.sourceLanguage,
      targetLanguage: dto.targetLanguage,
    });
    return {
      originalText,
      originalLanguage: dto.sourceLanguage ?? translation.sourceLanguage,
      translatedText: translation.translatedText,
      translatedLanguage: translation.targetLanguage,
      sourceAudioUrl: null,
      playbackAudioUrl: null,
      provider: translation.provider,
      model: translation.model,
      cacheHit: translation.cacheHit,
      fallbackUsed: translation.fallbackUsed,
    };
  }

  async intent(user: AuthUser, dto: { text?: string; transcript?: string; context?: string }) {
    const started = Date.now();
    const text = `${dto.text ?? ''} ${dto.transcript ?? ''}`.trim();
    const local = this.localIntent(text);
    if (local.intent !== 'unclear') {
      await this.usage.log({
        userId: user.sub,
        service: 'intent_extract',
        provider: 'local',
        model: 'keyword-rules',
        durationMs: Date.now() - started,
      });
      return local;
    }

    const route = await this.usage.route(user, 'intent_extract');
    if (!text || !route.allowed || route.fallbackProvider !== 'openrouter') {
      await this.usage.log({
        userId: user.sub,
        service: 'intent_extract',
        provider: 'local',
        model: 'manual-action',
        fallbackUsed: true,
        success: false,
        durationMs: Date.now() - started,
      });
      return local;
    }

    await this.usage.consume(user, 'openrouter');
    const parsed = await this.ai.chatJson<{ intent: HceIntentResult['intent']; confidence?: number }>(
      [
        {
          role: 'system',
          content:
            'Extract a ride-hailing driver app intent. Valid intents: accept, decline, arrived, start_trip, end_trip, traffic, collect_cash, call_passenger, cancel, go_online, navigate, unclear.',
        },
        { role: 'user', content: text },
      ],
      { model: route.fallbackModel, temperature: 0.1, maxTokens: 80 },
    );
    const result: HceIntentResult = {
      intent: parsed?.intent ?? 'unclear',
      confidence: parsed?.confidence ?? 0,
      source: parsed ? 'openrouter' : 'fallback',
    };
    await this.usage.log({
      userId: user.sub,
      service: 'intent_extract',
      provider: 'openrouter',
      model: route.fallbackModel,
      fallbackUsed: !parsed,
      success: Boolean(parsed),
      tokens: tokenEstimate(text),
      durationMs: Date.now() - started,
    });
    return result;
  }

  async voiceBooking(user: AuthUser, dto: { transcript?: string; text?: string }) {
    const started = Date.now();
    const text = `${dto.transcript ?? ''} ${dto.text ?? ''}`.trim();
    const cached = text ? await this.cache.get<any>('voice_booking', text, 'auto', 'booking') : null;
    if (cached) {
      await this.usage.log({
        userId: user.sub,
        service: 'voice_booking',
        provider: cached.provider ?? 'cache',
        model: cached.model ?? 'cache',
        cacheHit: true,
        durationMs: Date.now() - started,
      });
      return { ...cached, cacheHit: true };
    }
    const route = await this.usage.route(user, 'voice_booking');
    if (!text || !route.allowed || route.provider !== 'openrouter') {
      const result = {
        destination: null,
        lat: null,
        lng: null,
        vehicleType: null,
        confidence: 0,
        resolvedAddress: null,
        fallback: 'manual_destination_entry',
        limitReason: route.reason,
      };
      await this.usage.log({
        userId: user.sub,
        service: 'voice_booking',
        provider: route.fallbackProvider,
        model: route.fallbackModel,
        fallbackUsed: true,
        success: false,
        durationMs: Date.now() - started,
      });
      return result;
    }

    await this.usage.consume(user, 'openrouter');
    const parsed = await this.ai.chatJson<{
      destination: string | null;
      vehicleType?: string | null;
      confidence?: number;
    }>(
      [
        {
          role: 'system',
          content:
            'Extract a ride booking destination from Nigerian ride-hailing speech. Return destination, optional vehicleType, confidence 0-1.',
        },
        { role: 'user', content: text },
      ],
      { model: route.model, temperature: 0.1, maxTokens: 120 },
    );
    const landmark = parsed?.destination
      ? await this.resolveLandmark(user, { description: parsed.destination })
      : null;
    const result = {
      destination: parsed?.destination ?? null,
      lat: landmark?.lat ?? null,
      lng: landmark?.lng ?? null,
      vehicleType: parsed?.vehicleType ?? null,
      confidence: parsed?.confidence ?? 0,
      resolvedAddress: landmark?.landmarkName ?? parsed?.destination ?? null,
      provider: 'openrouter',
      model: route.model,
      fallbackUsed: !parsed,
    };
    if (text) {
      await this.cache.set('voice_booking', text, result, {
        sourceLanguage: 'auto',
        targetLanguage: 'booking',
        provider: 'openrouter',
        model: route.model,
      });
    }
    await this.usage.log({
      userId: user.sub,
      service: 'voice_booking',
      provider: 'openrouter',
      model: route.model,
      fallbackUsed: !parsed,
      success: Boolean(parsed),
      tokens: tokenEstimate(text),
      durationMs: Date.now() - started,
    });
    return result;
  }

  async resolveLandmark(user: AuthUser, dto: { description: string; zone?: string }) {
    const started = Date.now();
    const description = normalizeText(dto.description);
    const rows = await this.prisma.$queryRaw<Array<{
      id: string;
      name: string;
      aliases: unknown;
      lat: number;
      lng: number;
    }>>`
      SELECT id, name, aliases, lat::float AS lat, lng::float AS lng
      FROM landmark_database
      WHERE (${dto.zone ?? null}::text IS NULL OR zone ILIKE ${dto.zone ?? ''})
      ORDER BY usage_count DESC, verified DESC
      LIMIT 200;
    `;
    for (const row of rows) {
      const aliases = Array.isArray(row.aliases) ? row.aliases.map(String) : [];
      const names = [row.name, ...aliases];
      if (names.some((name) => description.includes(normalizeText(name)))) {
        await this.prisma.$executeRaw`
          UPDATE landmark_database SET usage_count = usage_count + 1 WHERE id = ${row.id}::uuid;
        `;
        await this.usage.log({
          userId: user.sub,
          service: 'landmark',
          provider: 'local',
          model: 'abuja-landmark-db',
          durationMs: Date.now() - started,
        });
        return { lat: row.lat, lng: row.lng, landmarkName: row.name, confidence: 1, provider: 'local' };
      }
    }

    const route = await this.usage.route(user, 'landmark');
    if (!route.allowed || route.fallbackProvider !== 'openrouter') {
      await this.usage.log({
        userId: user.sub,
        service: 'landmark',
        provider: 'local',
        model: 'manual-location-search',
        fallbackUsed: true,
        success: false,
        durationMs: Date.now() - started,
      });
      return { lat: null, lng: null, landmarkName: null, confidence: 0, fallback: 'manual_location_search' };
    }

    await this.usage.consume(user, 'openrouter');
    const parsed = await this.ai.chatJson<{ landmarkName: string | null; confidence?: number }>(
      [
        {
          role: 'system',
          content:
            'Interpret Abuja landmark text for a ride-hailing app. Return a likely landmarkName only if clear, with confidence 0-1.',
        },
        { role: 'user', content: dto.description },
      ],
      { model: route.fallbackModel, temperature: 0.1, maxTokens: 80 },
    );
    await this.usage.log({
      userId: user.sub,
      service: 'landmark',
      provider: 'openrouter',
      model: route.fallbackModel,
      fallbackUsed: !parsed,
      success: Boolean(parsed),
      tokens: tokenEstimate(dto.description),
      durationMs: Date.now() - started,
    });
    return {
      lat: null,
      lng: null,
      landmarkName: parsed?.landmarkName ?? null,
      confidence: parsed?.confidence ?? 0,
      provider: 'openrouter',
      fallback: 'manual_location_search',
    };
  }

  async assistant(user: AuthUser, dto: { question?: string; transcript?: string }) {
    const started = Date.now();
    const question = `${dto.question ?? ''} ${dto.transcript ?? ''}`.trim();
    const normalized = normalizeText(question);
    if (normalized.includes('earn') || normalized.includes('made today')) {
      await this.usage.log({
        userId: user.sub,
        service: 'assistant',
        provider: 'local',
        model: 'earnings-template',
        durationMs: Date.now() - started,
      });
      return {
        question,
        answerText: 'Open your earnings tab to see today earnings and bonus progress.',
        answerAudioUrl: null,
        provider: 'local',
      };
    }
    const cached = question ? await this.cache.get<any>('assistant', question, 'auto', 'answer') : null;
    if (cached) {
      await this.usage.log({
        userId: user.sub,
        service: 'assistant',
        provider: cached.provider ?? 'cache',
        model: cached.model ?? 'cache',
        cacheHit: true,
        durationMs: Date.now() - started,
      });
      return { ...cached, cacheHit: true };
    }
    const route = await this.usage.route(user, 'assistant');
    if (!question || !route.allowed || route.provider !== 'openrouter') {
      const result = {
        question,
        answerText: 'Please contact support for help with this question.',
        answerAudioUrl: null,
        fallbackUsed: true,
        limitReason: route.reason,
      };
      await this.usage.log({
        userId: user.sub,
        service: 'assistant',
        provider: route.fallbackProvider,
        model: route.fallbackModel,
        fallbackUsed: true,
        success: false,
        durationMs: Date.now() - started,
      });
      return result;
    }

    await this.usage.consume(user, 'openrouter');
    const answer = await this.ai.prompt(
      'You are a concise driver assistant for HiGO Abuja. Keep answers short and practical.',
      question,
      { model: route.model, temperature: 0.2, maxTokens: 140 },
    );
    const result = {
      question,
      answerText: answer ?? 'Please contact support for help with this question.',
      answerAudioUrl: null,
      provider: 'openrouter',
      model: route.model,
      fallbackUsed: !answer,
    };
    await this.cache.set('assistant', question, result, {
      sourceLanguage: 'auto',
      targetLanguage: 'answer',
      provider: 'openrouter',
      model: route.model,
    });
    await this.usage.log({
      userId: user.sub,
      service: 'assistant',
      provider: 'openrouter',
      model: route.model,
      fallbackUsed: !answer,
      success: Boolean(answer),
      tokens: tokenEstimate(question),
      durationMs: Date.now() - started,
    });
    return result;
  }

  async getLanguagePreference(user: AuthUser) {
    const preferenceUserId = await this.preferenceUserId(user);
    const preference = await this.prisma.userLanguagePreference.upsert({
      where: { userId: preferenceUserId },
      create: {
        userId: preferenceUserId,
        userType: user.type as any,
        languageCode: 'en',
      },
      update: {},
    });
    return { preference };
  }

  async updateLanguagePreference(
    user: AuthUser,
    dto: { languageCode: string; voiceGender?: 'male' | 'female'; autoReadoutEnabled?: boolean },
  ) {
    const languageCode = languageOrDefault(dto.languageCode);
    const preferenceUserId = await this.preferenceUserId(user);
    const preference = await this.prisma.userLanguagePreference.upsert({
      where: { userId: preferenceUserId },
      create: {
        userId: preferenceUserId,
        userType: user.type as any,
        languageCode,
        voiceGender: dto.voiceGender ?? 'male',
        autoReadoutEnabled: dto.autoReadoutEnabled ?? true,
      },
      update: {
        languageCode,
        ...(dto.voiceGender && { voiceGender: dto.voiceGender }),
        ...(typeof dto.autoReadoutEnabled === 'boolean' && {
          autoReadoutEnabled: dto.autoReadoutEnabled,
        }),
      },
    });
    if (user.type === 'passenger') {
      await this.prisma.user.update({ where: { id: user.sub }, data: { preferredLanguage: languageCode } });
    } else if (user.type === 'driver') {
      await this.prisma.$executeRaw`
        UPDATE drivers SET preferred_language = ${languageCode} WHERE id = ${user.sub}::uuid;
      `;
    }
    return preference;
  }

  private async preferenceUserId(user: AuthUser): Promise<string> {
    if (user.type !== 'driver') return user.sub;
    const driver = await this.prisma.driver.findUnique({
      where: { id: user.sub },
      select: { userId: true },
    });
    if (!driver?.userId) {
      throw new AppException('NOT_FOUND', undefined, 'Driver user account not found');
    }
    return driver.userId;
  }

  voicePack(language: string, key: string) {
    const selectedLanguage = languageOrDefault(language);
    const entry = VOICE_PACK_MANIFEST[key]?.[selectedLanguage];
    if (!entry) {
      throw new AppException('NOT_FOUND', undefined, 'Voice pack phrase not found');
    }
    return entry;
  }

  phrases(language: string) {
    const selectedLanguage = languageOrDefault(language);
    return {
      language: selectedLanguage,
      phrases: Object.entries(PHRASE_DICTIONARY).map(([key, value]) => ({
        category: key,
        text: value[selectedLanguage],
        audioUrl: null,
      })),
    };
  }
}
