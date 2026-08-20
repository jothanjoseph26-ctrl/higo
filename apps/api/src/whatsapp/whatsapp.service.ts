import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HceService } from '../hce/hce.service';
import {
  WhatsAppConversationState,
  WhatsAppRole,
  ErrorType,
  ErrorSeverity,
  ErrorClassification,
  HealthStatus,
  CircuitBreakerState,
  ErrorRecord,
  WhatsAppMessagePayload,
} from './whatsapp.types';

const META_GRAPH_URL = 'https://graph.facebook.com/v19.0';
const MAX_RETRY_ATTEMPTS = 3;
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_RESET_MS = 60_000;
const MESSAGE_LENGTH_LIMIT = 4096;

const LANGUAGE_DETECTION_PATTERNS: Array<{ lang: string; patterns: RegExp[] }> = [
  {
    lang: 'ha',
    patterns: [
      /sannu/i, /yaya\s+iki/i, /na\s+so/i, /taya/i, /karba/i,
      /kudi/i, /jari/i, /aya/i, /anasso/i, /gida/i,
    ],
  },
  {
    lang: 'yo',
    patterns: [
      /bawo\s+ni/i, /ka\s+abo/i, /mo\s+fe/i, /se/i, /owo/i,
      /iran/i, /ile/i, /omo/i, /ojo/i, /owo/i,
    ],
  },
  {
    lang: 'ig',
    patterns: [
      /kedu/i, /daalụ/i, /achọrọ/i, /ụgbọ/i, /ego/i,
      /Ụwa/i, /ụlọ/i, /nwoke/i, /Ụtụtụ/i, /ego/i,
    ],
  },
  {
    lang: 'pcm',
    patterns: [
      /how\s+far/i, /wetin/i, /i\s+want/i, /abeg/i, /money/i,
      /road/i, /house/i, /brother/i, /today/i, /work/i,
    ],
  },
];

const INTENT_KEYWORDS: Record<string, RegExp> = {
  register: /^(register|signup|sign\s*up|start|kwashe|bidi|jowa|maka)/i,
  help: /^(help|support|support|taimako|iranran|enyemaka|oya)/i,
  sos: /^(sos|emergency|emergency|gaggayya|ijora|ịrịa|help\s*me)/i,
  book_ride: /^(book|ride|book\s*ride|tafiya|irinajo|agha|ire\s*ota)/i,
  cancel: /^(cancel|cancel\s*ride|soke|fagile|jikwaa|kagbuo)/i,
  status: /^(status|track|where|track\s*ride|wane|ibo|ole)/i,
  fare: /^(fare|price|how\s*much|kudi|owu|ego|how\s*much)/i,
  feedback: /^(feedback|review|complain|review|yabo|asusu|onyinye)/i,
  language: /^(language|change\s*language|harshe|ete|asu|asụsụ)/i,
  menu: /^(menu|options|commands|menu|zažibi|nhọrọ|nhọrọ|akụkọ)/i,
  referral: /^(referral|refer|invite|invite|kira|kpọrọ|invite)/i,
  driver_register: /^(driver|become\s*driver|drive|maiveya|oge|agha|nde)/i,
  passenger_register: /^(passenger|rider|become\s*passenger|fasinja|aroki|onye)/i,
};

interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  errorType?: ErrorType;
}

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  private circuitBreaker: CircuitBreakerState = {
    failures: 0,
    lastFailure: 0,
    state: 'closed',
    successCount: 0,
  };

  private errorStats: Map<ErrorType, number> = new Map();
  private recentErrors: ErrorRecord[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly hce: HceService,
  ) {}

  async verifyWebhook(
    mode: string,
    token: string,
    challenge: string,
  ): Promise<string | null> {
    if (mode !== 'subscribe') {
      this.logger.warn(`Webhook verification failed: invalid mode "${mode}"`);
      return null;
    }

    const config = await this.prisma.whatsAppConfig.findFirst({
      where: { isActive: true, verifyToken: token },
    });

    if (!config) {
      this.logger.warn(`Webhook verification failed: no config for token "${token}"`);
      return null;
    }

    this.logger.log(`Webhook verified for phone_number_id: ${config.phoneNumberId}`);
    return challenge;
  }

  async processWebhook(payload: WhatsAppMessagePayload): Promise<void> {
    if (payload.object !== 'whatsapp_business_account') {
      this.logger.debug(`Ignoring non-WhatsApp payload: ${payload.object}`);
      return;
    }

    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        if (change.field !== 'messages') continue;

        const { metadata, contacts, messages, statuses } = change.value;

        if (statuses?.length) {
          await this.handleStatusUpdates(statuses, metadata.phone_number_id);
        }

        if (messages?.length) {
          for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            const contact = contacts?.[i];
            await this.processIncomingMessage(
              msg,
              contact,
              metadata.phone_number_id,
              metadata.display_phone_number,
            );
          }
        }
      }
    }
  }

  private async processIncomingMessage(
    msg: WhatsAppMessagePayload['entry'][0]['changes'][0]['value']['messages'][0],
    contact: WhatsAppMessagePayload['entry'][0]['changes'][0]['value']['contacts'][0] | undefined,
    phoneNumberId: string,
    displayPhoneNumber: string,
  ): Promise<void> {
    const startTime = Date.now();

    try {
      const config = await this.getOrCreateConfig(phoneNumberId);
      if (!config) {
        this.logger.error(`No config found for phone_number_id: ${phoneNumberId}`);
        return;
      }

      await this.prisma.whatsAppConfig.update({
        where: { id: config.id },
        data: { lastWebhookReceivedAt: new Date() },
      });

      const textContent = this.extractTextContent(msg);
      if (!textContent) {
        this.logger.debug(`Ignoring non-text message from ${msg.from}: ${msg.type}`);
        return;
      }

      const conversation = await this.getOrCreateConversation(
        config.id,
        msg.from,
        contact?.profile?.name,
      );

      await this.logInboundMessage(conversation.id, msg, textContent);

      await this.prisma.whatsAppConversation.update({
        where: { id: conversation.id },
        data: {
          lastUserMessage: textContent,
          messageCount: { increment: 1 },
          lastMessageAt: new Date(),
        },
      });

      if (conversation.isHumanHandoff) {
        this.logger.debug(`Conversation ${conversation.id} in human handoff, skipping bot`);
        return;
      }

      if (conversation.conversationState === WhatsAppConversationState.HUMAN_HANDOFF) {
        this.logger.debug(`Conversation ${conversation.id} state is human_handoff, skipping bot`);
        return;
      }

      const detectedLang = this.detectLanguage(textContent, conversation.preferredLanguage);
      if (detectedLang !== conversation.preferredLanguage) {
        await this.prisma.whatsAppConversation.update({
          where: { id: conversation.id },
          data: { preferredLanguage: detectedLang },
        });
      }

      const intent = this.detectIntent(textContent);
      const response = await this.generateResponse(conversation, textContent, intent, detectedLang);

      const sendResult = await this.sendMessage(config.phoneNumberId, msg.from, response, config.accessToken);

      await this.logOutboundMessage(conversation.id, response, sendResult);

      if (sendResult.success) {
        await this.prisma.whatsAppConversation.update({
          where: { id: conversation.id },
          data: {
            lastBotMessage: response,
            lastIntent: intent,
          },
        });

        await this.prisma.whatsAppConfig.update({
          where: { id: config.id },
          data: { totalMessagesProcessed: { increment: 1 } },
        });
      }

      const duration = Date.now() - startTime;
      this.logger.log(
        `Processed message from ${msg.from} in ${duration}ms | intent=${intent} lang=${detectedLang} state=${conversation.conversationState}`,
      );
    } catch (error) {
      this.logger.error(`Error processing message from ${msg.from}:`, error);
      this.recordError(ErrorType.TEMPORARY_FAILURE, error.message, { from: msg.from });
    }
  }

  private extractTextContent(
    msg: WhatsAppMessagePayload['entry'][0]['changes'][0]['value']['messages'][0],
  ): string | null {
    if (msg.type === 'text' && msg.text?.body) {
      return msg.text.body.trim();
    }
    if (msg.type === 'interactive') {
      if (msg.interactive?.button_reply?.title) {
        return msg.interactive.button_reply.title.trim();
      }
      if (msg.interactive?.list_reply?.title) {
        return msg.interactive.list_reply.title.trim();
      }
    }
    return null;
  }

  private async getOrCreateConfig(phoneNumberId: string) {
    let config = await this.prisma.whatsAppConfig.findUnique({
      where: { phoneNumberId },
    });

    if (!config) {
      config = await this.prisma.whatsAppConfig.create({
        data: {
          phoneNumberId,
          accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
          verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || 'default_verify_token',
          appSecret: process.env.WHATSAPP_APP_SECRET,
        },
      });
      this.logger.log(`Created new WhatsApp config for ${phoneNumberId}`);
    }

    return config;
  }

  private async getOrCreateConversation(
    configId: string,
    phone: string,
    name?: string,
  ) {
    let conversation = await this.prisma.whatsAppConversation.findUnique({
      where: {
        configId_whatsappPhone: { configId, whatsappPhone: phone },
      },
    });

    if (!conversation) {
      conversation = await this.prisma.whatsAppConversation.create({
        data: {
          configId,
          whatsappPhone: phone,
          whatsappName: name,
          role: WhatsAppRole.UNKNOWN,
          conversationState: WhatsAppConversationState.IDLE,
        },
      });
      this.logger.log(`Created new conversation for ${phone}`);
    } else if (name && name !== conversation.whatsappName) {
      conversation = await this.prisma.whatsAppConversation.update({
        where: { id: conversation.id },
        data: { whatsappName: name },
      });
    }

    return conversation;
  }

  private detectLanguage(text: string, currentLang: string): string {
    const normalized = text.toLowerCase().trim();

    for (const { lang, patterns } of LANGUAGE_DETECTION_PATTERNS) {
      for (const pattern of patterns) {
        if (pattern.test(normalized)) {
          this.logger.debug(`Language detected: ${lang} from text: "${text}"`);
          return lang;
        }
      }
    }

    return currentLang || 'en';
  }

  private detectIntent(text: string): string {
    const normalized = text.toLowerCase().trim();

    for (const [intent, pattern] of Object.entries(INTENT_KEYWORDS)) {
      if (pattern.test(normalized)) {
        this.logger.debug(`Intent detected: ${intent} from text: "${text}"`);
        return intent;
      }
    }

    return 'general';
  }

  private async generateResponse(
    conversation: {
      id: string;
      conversationState: string;
      role: string;
      preferredLanguage: string;
      whatsappPhone: string;
      onboardingData: unknown;
      failedAiAttempts: number;
    },
    text: string,
    intent: string,
    language: string,
  ): Promise<string> {
    const state = conversation.conversationState as WhatsAppConversationState;

    switch (state) {
      case WhatsAppConversationState.AWAITING_PASSENGER_NAME:
        return this.handlePassengerName(conversation, text, language);
      case WhatsAppConversationState.AWAITING_PASSENGER_CITY:
        return this.handlePassengerCity(conversation, text, language);
      case WhatsAppConversationState.AWAITING_DRIVER_NAME:
        return this.handleDriverName(conversation, text, language);
      case WhatsAppConversationState.AWAITING_DRIVER_VEHICLE:
        return this.handleDriverVehicle(conversation, text, language);
      case WhatsAppConversationState.AWAITING_DRIVER_CITY:
        return this.handleDriverCity(conversation, text, language);
      case WhatsAppConversationState.HUMAN_HANDOFF:
        return '';
      default:
        return this.handleIdleState(conversation, text, intent, language);
    }
  }

  private async handleIdleState(
    conversation: {
      id: string;
      role: string;
      preferredLanguage: string;
      whatsappPhone: string;
      failedAiAttempts: number;
    },
    text: string,
    intent: string,
    language: string,
  ): Promise<string> {
    switch (intent) {
      case 'register':
      case 'passenger_register':
        return this.startPassengerRegistration(conversation.id, language);
      case 'driver_register':
        return this.startDriverRegistration(conversation.id, language);
      case 'help':
        return this.getSupportResponse(language);
      case 'sos':
        return this.getSosResponse(language);
      case 'menu':
        return this.getMenuResponse(language);
      case 'book_ride':
        return this.getBookRideResponse(language);
      case 'cancel':
        return this.getCancelRideResponse(language);
      case 'status':
        return this.getStatusResponse(language);
      case 'fare':
        return this.getFareResponse(language);
      case 'feedback':
        return this.getFeedbackResponse(language);
      case 'referral':
        return this.getReferralResponse(language);
      case 'language':
        return this.getLanguageChangeResponse(language);
      default:
        return this.getAiResponse(conversation, text, language);
    }
  }

  private async startPassengerRegistration(
    conversationId: string,
    language: string,
  ): Promise<string> {
    await this.prisma.whatsAppConversation.update({
      where: { id: conversationId },
      data: {
        conversationState: WhatsAppConversationState.AWAITING_PASSENGER_NAME,
        role: WhatsAppRole.PASSENGER,
        onboardingData: { step: 'name' },
      },
    });
    return this.t('register_passenger_name', language);
  }

  private async startDriverRegistration(
    conversationId: string,
    language: string,
  ): Promise<string> {
    await this.prisma.whatsAppConversation.update({
      where: { id: conversationId },
      data: {
        conversationState: WhatsAppConversationState.AWAITING_DRIVER_NAME,
        role: WhatsAppRole.DRIVER,
        onboardingData: { step: 'name' },
      },
    });
    return this.t('register_driver_name', language);
  }

  private async handlePassengerName(
    conversation: { id: string; onboardingData: unknown },
    name: string,
    language: string,
  ): Promise<string> {
    const data = (conversation.onboardingData as Record<string, unknown>) || {};
    await this.prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: {
        conversationState: WhatsAppConversationState.AWAITING_PASSENGER_CITY,
        onboardingData: { ...data, name, step: 'city' },
      },
    });
    return this.t('register_passenger_city', language, { name });
  }

  private async handlePassengerCity(
    conversation: { id: string; whatsappPhone: string; whatsappName: string; onboardingData: unknown },
    city: string,
    language: string,
  ): Promise<string> {
    const data = (conversation.onboardingData as Record<string, unknown>) || {};

    const passenger = await this.prisma.$executeRaw`
      INSERT INTO users (id, phone, full_name, city, role, created_at, updated_at)
      VALUES (${crypto.randomUUID()}, ${conversation.whatsappPhone}, ${conversation.whatsappName || 'WhatsApp User'}, ${city}, 'passenger', NOW(), NOW())
      ON CONFLICT (phone) DO UPDATE SET full_name = EXCLUDED.full_name, city = EXCLUDED.city, updated_at = NOW()
      RETURNING id;
    `;

    await this.prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: {
        conversationState: WhatsAppConversationState.IDLE,
        onboardingData: { ...data, city, completedAt: new Date().toISOString() },
      },
    });

    return this.t('register_passenger_complete', language, { city });
  }

  private async handleDriverName(
    conversation: { id: string; onboardingData: unknown },
    name: string,
    language: string,
  ): Promise<string> {
    const data = (conversation.onboardingData as Record<string, unknown>) || {};
    await this.prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: {
        conversationState: WhatsAppConversationState.AWAITING_DRIVER_VEHICLE,
        onboardingData: { ...data, name, step: 'vehicle' },
      },
    });
    return this.t('register_driver_vehicle', language, { name });
  }

  private async handleDriverVehicle(
    conversation: { id: string; onboardingData: unknown },
    vehicle: string,
    language: string,
  ): Promise<string> {
    const data = (conversation.onboardingData as Record<string, unknown>) || {};
    await this.prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: {
        conversationState: WhatsAppConversationState.AWAITING_DRIVER_CITY,
        onboardingData: { ...data, vehicle, step: 'city' },
      },
    });
    return this.t('register_driver_city', language);
  }

  private async handleDriverCity(
    conversation: { id: string; whatsappPhone: string; whatsappName: string; onboardingData: unknown },
    city: string,
    language: string,
  ): Promise<string> {
    const data = (conversation.onboardingData as Record<string, unknown>) || {};

    const driver = await this.prisma.$executeRaw`
      INSERT INTO drivers (id, phone, full_name, city, vehicle_type, status, created_at, updated_at)
      VALUES (${crypto.randomUUID()}, ${conversation.whatsappPhone}, ${conversation.whatsappName || 'WhatsApp User'}, ${city}, ${data.vehicle || 'unknown'}, 'pending', NOW(), NOW())
      ON CONFLICT (phone) DO UPDATE SET full_name = EXCLUDED.full_name, city = EXCLUDED.city, vehicle_type = EXCLUDED.vehicle_type, updated_at = NOW()
      RETURNING id;
    `;

    await this.prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: {
        conversationState: WhatsAppConversationState.IDLE,
        onboardingData: { ...data, city, completedAt: new Date().toISOString() },
      },
    });

    return this.t('register_driver_complete', language, { city, vehicle: data.vehicle || '' });
  }

  private async getAiResponse(
    conversation: { id: string; whatsappPhone: string; preferredLanguage: string; failedAiAttempts: number },
    text: string,
    language: string,
  ): Promise<string> {
    if (conversation.failedAiAttempts >= 3) {
      return this.t('ai_fallback', language);
    }

    try {
      const result = await this.hce.assistant(
        { sub: conversation.whatsappPhone, type: 'passenger' } as never,
        { question: text },
      );

      if (!result?.answerText) {
        await this.prisma.whatsAppConversation.update({
          where: { id: conversation.id },
          data: { failedAiAttempts: { increment: 1 } },
        });
        return this.t('ai_fallback', language);
      }

      await this.prisma.whatsAppConversation.update({
        where: { id: conversation.id },
        data: { failedAiAttempts: 0, lastAiResponseAt: new Date() },
      });

      return result.answerText;
    } catch (error) {
      this.logger.error(`AI response failed for conversation ${conversation.id}:`, error);
      await this.prisma.whatsAppConversation.update({
        where: { id: conversation.id },
        data: { failedAiAttempts: { increment: 1 } },
      });

      this.recordError(ErrorType.AI_RESPONSE_FAILED, error.message, { conversationId: conversation.id });
      return this.t('ai_fallback', language);
    }
  }

  async sendMessage(
    phoneNumberId: string,
    to: string,
    text: string,
    accessToken: string,
  ): Promise<SendResult> {
    if (!text) {
      return { success: true };
    }

    const truncated = text.length > MESSAGE_LENGTH_LIMIT
      ? text.slice(0, MESSAGE_LENGTH_LIMIT - 3) + '...'
      : text;

    const maxAttempts = this.circuitBreaker.state === 'open' ? 1 : MAX_RETRY_ATTEMPTS;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(`${META_GRAPH_URL}/${phoneNumberId}/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to,
            type: 'text',
            text: { body: truncated },
          }),
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          const errorType = this.classifyHttpError(response.status);

          this.logger.error(
            `Meta API error ${response.status} (attempt ${attempt}/${maxAttempts}):`,
            errorBody,
          );

          this.recordError(errorType, `HTTP ${response.status}`, {
            to,
            attempt,
            status: response.status,
            errorBody,
          });

          if (this.isRetryableError(response.status) && attempt < maxAttempts) {
            await this.delay(Math.pow(2, attempt) * 500);
            continue;
          }

          return {
            success: false,
            error: errorBody?.error?.message || `HTTP ${response.status}`,
            errorType,
          };
        }

        const result = await response.json();
        const messageId = result?.messages?.[0]?.id;

        this.recordSuccess();
        return { success: true, messageId };
      } catch (error) {
        const errorType = this.classifyNetworkError(error);

        this.logger.error(
          `Network error sending message (attempt ${attempt}/${maxAttempts}):`,
          error.message,
        );

        this.recordError(errorType, error.message, { to, attempt });

        if (attempt < maxAttempts && errorType === ErrorType.NETWORK_TIMEOUT) {
          await this.delay(Math.pow(2, attempt) * 500);
          continue;
        }

        return {
          success: false,
          error: error.message,
          errorType,
        };
      }
    }

    return { success: false, error: 'Max retries exceeded', errorType: ErrorType.TEMPORARY_FAILURE };
  }

  private classifyHttpError(status: number): ErrorType {
    if (status === 429) return ErrorType.RATE_LIMIT;
    if (status === 401 || status === 403) return ErrorType.AUTH_EXPIRED;
    if (status === 400) return ErrorType.INVALID_PHONE;
    if (status >= 500) return ErrorType.API_UNAVAILABLE;
    return ErrorType.TEMPORARY_FAILURE;
  }

  private classifyNetworkError(error: Error): ErrorType {
    if (error.name === 'AbortError' || error.message?.includes('timeout')) {
      return ErrorType.NETWORK_TIMEOUT;
    }
    if (error.message?.includes('ECONNREFUSED') || error.message?.includes('ENOTFOUND')) {
      return ErrorType.API_UNAVAILABLE;
    }
    return ErrorType.TEMPORARY_FAILURE;
  }

  private isRetryableError(status: number): boolean {
    return status === 429 || status >= 500;
  }

  private recordError(type: ErrorType, message: string, context?: Record<string, unknown>): void {
    const count = this.errorStats.get(type) || 0;
    this.errorStats.set(type, count + 1);

    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailure = Date.now();
    this.circuitBreaker.successCount = 0;

    if (this.circuitBreaker.failures >= CIRCUIT_BREAKER_THRESHOLD) {
      this.circuitBreaker.state = 'open';
      this.logger.warn(
        `Circuit breaker OPEN after ${this.circuitBreaker.failures} consecutive failures`,
      );
    }

    const severity = this.getErrorSeverity(type);
    const record: ErrorRecord = {
      timestamp: Date.now(),
      type,
      severity,
      message,
      context,
      resolved: false,
    };

    this.recentErrors.push(record);
    if (this.recentErrors.length > 100) {
      this.recentErrors = this.recentErrors.slice(-100);
    }

    if (severity === ErrorSeverity.CRITICAL) {
      this.logger.error(`CRITICAL WhatsApp error: ${type} - ${message}`, context);
    }
  }

  private recordSuccess(): void {
    this.circuitBreaker.successCount++;
    if (this.circuitBreaker.state === 'half-open' && this.circuitBreaker.successCount >= 2) {
      this.circuitBreaker.state = 'closed';
      this.circuitBreaker.failures = 0;
      this.circuitBreaker.successCount = 0;
      this.logger.log('Circuit breaker CLOSED - service recovered');
    } else if (this.circuitBreaker.state === 'closed') {
      this.circuitBreaker.failures = 0;
    }
  }

  private getErrorSeverity(type: ErrorType): ErrorSeverity {
    const severityMap: Record<ErrorType, ErrorSeverity> = {
      [ErrorType.NETWORK_TIMEOUT]: ErrorSeverity.MEDIUM,
      [ErrorType.RATE_LIMIT]: ErrorSeverity.MEDIUM,
      [ErrorType.API_UNAVAILABLE]: ErrorSeverity.HIGH,
      [ErrorType.TEMPORARY_FAILURE]: ErrorSeverity.MEDIUM,
      [ErrorType.INVALID_SIGNATURE]: ErrorSeverity.CRITICAL,
      [ErrorType.INVALID_PHONE]: ErrorSeverity.LOW,
      [ErrorType.MESSAGE_TOO_LONG]: ErrorSeverity.LOW,
      [ErrorType.TEMPLATE_NOT_FOUND]: ErrorSeverity.LOW,
      [ErrorType.AI_RESPONSE_FAILED]: ErrorSeverity.MEDIUM,
      [ErrorType.CONVERSATION_NOT_FOUND]: ErrorSeverity.LOW,
      [ErrorType.CONFIG_MISSING]: ErrorSeverity.HIGH,
      [ErrorType.AUTH_EXPIRED]: ErrorSeverity.CRITICAL,
      [ErrorType.WEBHOOK_REJECTED]: ErrorSeverity.MEDIUM,
    };
    return severityMap[type] || ErrorSeverity.MEDIUM;
  }

  private async handleStatusUpdates(
    statuses: WhatsAppMessagePayload['entry'][0]['changes'][0]['value']['statuses'],
    phoneNumberId: string,
  ): Promise<void> {
    for (const status of statuses) {
      try {
        await this.prisma.whatsAppMessage.updateMany({
          where: {
            conversation: { config: { phoneNumberId } },
            metadata: { path: ['metaMessageId'], equals: status.id },
          },
          data: { status: status.status },
        });
      } catch (error) {
        this.logger.debug(`Failed to update status for message ${status.id}: ${error.message}`);
      }
    }
  }

  private async logInboundMessage(
    conversationId: string,
    msg: WhatsAppMessagePayload['entry'][0]['changes'][0]['value']['messages'][0],
    text: string,
  ): Promise<void> {
    try {
      await this.prisma.whatsAppMessage.create({
        data: {
          conversationId,
          direction: 'inbound',
          messageType: msg.type,
          content: text,
          status: 'received',
          metadata: {
            metaMessageId: msg.id,
            timestamp: msg.timestamp,
            from: msg.from,
          },
        },
      });
    } catch (error) {
      this.logger.error(`Failed to log inbound message: ${error.message}`);
    }
  }

  private async logOutboundMessage(
    conversationId: string,
    text: string,
    result: SendResult,
  ): Promise<void> {
    try {
      await this.prisma.whatsAppMessage.create({
        data: {
          conversationId,
          direction: 'outbound',
          messageType: 'text',
          content: text,
          status: result.success ? 'sent' : 'failed',
          errorMessage: result.error || null,
          metadata: result.messageId
            ? { metaMessageId: result.messageId }
            : { errorType: result.errorType },
        },
      });
    } catch (error) {
      this.logger.error(`Failed to log outbound message: ${error.message}`);
    }
  }

  getHealthStatus(): HealthStatus {
    const now = Date.now();
    const recentWindow = 5 * 60 * 1000;
    const recentErrors = this.recentErrors.filter(
      (e) => now - e.timestamp < recentWindow && !e.resolved,
    );

    const totalRecent = recentErrors.length;
    const errorRate = totalRecent > 0 ? totalRecent / (totalRecent + 10) : 0;

    let status: HealthStatus['status'] = 'healthy';
    if (this.circuitBreaker.state === 'open') {
      status = 'unhealthy';
    } else if (errorRate > 0.1 || this.circuitBreaker.failures > 2) {
      status = 'degraded';
    }

    return {
      service: 'whatsapp',
      status,
      lastCheck: new Date(),
      latency: 0,
      errorRate,
      consecutiveFailures: this.circuitBreaker.failures,
    };
  }

  getErrorStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const [type, count] of this.errorStats) {
      stats[type] = count;
    }
    return stats;
  }

  getCircuitBreakerState(): CircuitBreakerState {
    if (
      this.circuitBreaker.state === 'open' &&
      Date.now() - this.circuitBreaker.lastFailure > CIRCUIT_BREAKER_RESET_MS
    ) {
      this.circuitBreaker.state = 'half-open';
      this.circuitBreaker.successCount = 0;
      this.logger.log('Circuit breaker HALF-OPEN - testing recovery');
    }
    return { ...this.circuitBreaker };
  }

  private t(key: string, lang: string, vars?: Record<string, string>): string {
    const template = RESPONSE_TEMPLATES[key]?.[lang] || RESPONSE_TEMPLATES[key]?.['en'] || key;
    if (!vars) return template;
    return Object.entries(vars).reduce(
      (result, [k, v]) => result.replace(new RegExp(`\\{${k}\\}`, 'g'), v),
      template,
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

const RESPONSE_TEMPLATES: Record<string, Record<string, string>> = {
  register_passenger_name: {
    en: 'Welcome to HiGO! 🚗\n\nLet\'s get you set up as a passenger.\n\nPlease enter your full name:',
    ha: 'Barka da zuwa HiGO! 🚗\n\nKi sanar da sunan ka don ka yi rijista.\n\nKayi shigar da sunan ka cikakke:',
    yo: 'Kaabo si HiGO! 🚗\n\nJẹ ka ṣe ìwọ̀rán àkántí rẹ.\n\nJọ̀wọ́ fi orúkọ rẹ tàbí:',
    ig: 'Nnọọ HiGO! 🚗\n\nKa anyị mechaa nchịkọta gị dịka onye nọ na azụmahịa.\n\nTinye aha gị zuru oke:',
    pcm: 'Welcome to HiGO! 🚗\n\nMake we set you up as passenger.\n\nPut your full name:',
  },
  register_passenger_city: {
    en: 'Great, {name}! 🎉\n\nWhich city are you based in?\n(e.g., Abuja, Lagos, Kano)',
    ha: 'To, {name}! 🎉\n\nWanne garin ne kake zaune?\n(misali: Abuja, Lagos, Kano)',
    yo: 'Ó dara, {name}! �🎉\n\nIbùgbé rẹ ni ṣókí?\n(afipari: Abuja, Lagos, Kano)',
    ig: 'Ọ dị mma, {name}! 🎉\n\nEbe kedu ị nọ?\n(a ga-akọrọ: Abuja, Lagos, Kano)',
    pcm: 'Good one, {name}! 🎉\n\nWetin city you dey?\n(e.g., Abuja, Lagos, Kano)',
  },
  register_passenger_complete: {
    en: 'Registration complete! ✅\n\nYou\'re all set to book rides in {city}.\n\nType "menu" to see available options.',
    ha: 'Rijista ta gama! ✅\n\nKa shirya don yin rajista a {city}.\n\nRubuta "menu" don ganin zažužuwan.',
    yo: 'Ìwọ̀rán àkántí parí! ✅\n\nO ṣeé ṣe láti béèrè ìrìn àjò ní {city}.\n\nKọ "menu" láti rí àwọn àṣàyàn.',
    ig: 'Nchịkọta ghọrọ! ✅\n\nỊ dị njikere ije azụmahịa n\'{city}.\n\nPịa "menu" lebara anya n\'ọhọụrụ.',
    pcm: 'Registration don finish! ✅\n\nYou ready to book ride for {city}.\n\nType "menu" to see options.',
  },
  register_driver_name: {
    en: 'Welcome to HiGO Driver! 🚗💨\n\nLet\'s get you set up as a driver.\n\nPlease enter your full name:',
    ha: 'Barka da zuwa HiGO Driver! 🚗💨\n\nKi sanar da sunan ka don ka yi rijista a matsayin maiveya.\n\nKayi shigar da sunan ka cikakke:',
    yo: 'Kaabo si HiGO Driver! 🚗💨\n\nJẹ ka ṣe ìwọ̀rán àkántí rẹ gẹ́gẹ́ bí aṣọwèrè.\n\nJọ̀wọ́ fi orúkọ rẹ tàbí:',
    ig: 'Nnọọ HiGO Driver! 🚗💨\n\nKa anyị mechaa nchịkọta gị dịka onye na-eyi ndị ahịa.\n\nTinye aha gị zuru oke:',
    pcm: 'Welcome to HiGO Driver! 🚗💨\n\nMake we set you up as driver.\n\nPut your full name:',
  },
  register_driver_vehicle: {
    en: 'Thanks, {name}! 🚗\n\nWhat type of vehicle do you drive?\n(e.g., Sedan, SUV, Bike)',
    ha: 'Na gode, {name}! 🚗\n\nWanne irin motar ke kanawa?\n(misali: Sedan, SUV, Keke)',
    yo: 'Ọ̀ú, {name}! 🚗\n\nIrin ahunṣiṣe kankan ni o ń wè?\n(aafipari: Sedan, SUV, Keke)',
    ig: 'Daalụ, {name}! 🚗\n\nỤgbọala gị kedu na-eyi?\n(a ga-akọrọ: Sedan, SUV, Keke)',
    pcm: 'Thanks, {name}! 🚗\n\nWetin motor you dey drive?\n(e.g., Sedan, SUV, Keke)',
  },
  register_driver_city: {
    en: 'Got it! 📍\n\nWhich city will you be driving in?\n(e.g., Abuja, Lagos, Kano)',
    ha: 'An gane! 📍\n\nWanne garin ne za ka yi uwar mota?\n(misali: Abuja, Lagos, Kano)',
    yo: 'Mo lè rí! 📍\n\nIbùgbé kankan ni o ń ṣiṣẹ́?\n(aafipari: Abuja, Lagos, Kano)',
    ig: 'Aaghọtara m! 📍\n\nEbe kedu ị ga-ana-eyi?\n(a ga-akọrọ: Abuja, Lagos, Kano)',
    pcm: 'I don hear! 📍\n\nWetin city you wan dey drive for?\n(e.g., Abuja, Lagos, Kano)',
  },
  register_driver_complete: {
    en: 'Driver registration complete! ✅\n\nYour application in {city} is under review. You\'ll receive updates here.\n\nType "menu" to see available options.',
    ha: 'Rijista ta gama! ✅\n\nAn aika rajistar ka a {city} don dubawa. Za ka samu sabuntawa a nan.\n\nRubuta "menu" don ganin zažužuwan.',
    yo: 'Ìwọ̀rán àkántí aṣọwèrè parí! ✅\n\nÌbéèrè rẹ ní {city} ń wọ́ sílẹ̀. A yóò fi ìsọ̀kan sílẹ̀ níbẹ̀.\n\nKọ "menu" láti rí àwọn àṣàyàn.',
    ig: 'Nchịkọta onye na-eyi ndị ahịa ghọrọ! ✅\n\nNchịkọta gị n\'{city} nọ na nyochaa. Ị ga-anata updates ebe a.\n\nPịa "menu" lebara anya n\'ọhọụrụ.',
    pcm: 'Driver registration don finish! ✅\n\nYour application for {city} dey under review. You go see update here.\n\nType "menu" to see options.',
  },
  support_response: {
    en: 'HiGO Support 📞\n\nHow can we help you today?\n\n1. Book a ride\n2. Track my ride\n3. Report an issue\n4. Speak to a human\n\nType a number or describe your issue.',
    ha: 'HiGO Taimako 📞\n\nTa yaya za mu taimaka maka yau?\n\n1. Yi rajista\n2. Bi diddigin tafiya\n3. Ba da rahoto\n4. Yi magana da mutum\n\nRubuta lamba ko bayyana matsalar ka.',
    yo: 'HiGO Support 📞\n\nBáwo ni a ṣe é ran ọ lọ́wọ́ lọ́la?\n\n1. Bèèrè ìrìn àjò\n2. Tọ́ka sí ìrìn àjò\n3. Kọ ìṣòro\n4. Bá ènìyàn bá sọ̀rọ̀\n\nKọ nọ́mbà tàbí sọ ìṣòro rẹ.',
    ig: 'HiGO Nyochaa 📞\n\nKa anyị nyere gị aka otu:\n\n1. Nye aka nhọpụta\n2. Soro ịrịọ gị\n3. Kpọọ	nsogbu\n4. Kparịta ọka\n\nDee ọnụọgụgụ maọ bụ kọọ nsogbu gị.',
    pcm: 'HiGO Support 📞\n\nHow we fit help you today?\n\n1. Book ride\n2. Track my ride\n3. Report problem\n4. Talk to person\n\nType number or talk your problem.',
  },
  sos_response: {
    en: '🚨 EMERGENCY SOS 🚨\n\nIf you\'re in immediate danger, please call:\n\n- Police: 112 or 199\n- Emergency: 112\n\nYour location has been flagged. Help is on the way.\n\nType "ok" to confirm you\'re safe.',
    ha: '🚨 FARIN CIKI SOS 🚨\n\nIdan kake cikin haɗari, kira:\n\n- Yan Sanda: 112 ko 199\n- Gaggawa: 112\n\nAn yi alamar wurin ka. Taimako yana zuwa.\n\nRubuta "ok" don tabbatar da cewa kake aminci.',
    yo: '🚨 IPANLERO SOS 🚨\n\nBí o bá ní ewu, pe:\n\n- Oluascular: 112 tàbí 199\n- Ìpàdé: 112\n\nA ti kọ ìbùgbé rẹ. Aṣẹ̀wọ́ ń bọ̀.\n\nKọ "ok" láti jẹ́rìí pé o dáàbò bo.',
    ig: '🚨 IHE NTUGHARI SOS 🚨\n\nỌ bụrụ na ị nọ na ize ndụ, kpọọ:\n\n- Ndị uwe ọjọọ: 112ọ bụ 199\n- Ihe ntụgharị: 112\n\nA chọtara ebe gị. Enyemaka na-abịa.\n\nPịa "ok" izere na ị nọ n\'udo.',
    pcm: '🚨 EMERGENCY SOS 🚨\n\nIf you dey danger, call:\n\n- Police: 112 or 199\n- Emergency: 112\n\nYour location don mark. Help dey come.\n\nType "ok" to confirm you safe.',
  },
  book_ride: {
    en: 'Book a Ride 🚗\n\nTo book a ride, please open the HiGO app or visit our website.\n\nNeed help? Type "help".',
    ha: 'Yi Rajista 🚗\n\nDon yin rajista, buɗe manhajar HiGO ko ziyarci yanar dorinmu.\n\nKin yi buƙata? Rubuta "taimako".',
    yo: 'Bèèrè Ìrìn Àjò 🚗\n\nLáti béèrè ìrìn àjò, jọ̀wọ́ sí HiGO tàbí wò àpótí wa.\n\nNí ìfọ̀rọ̀wánilẹnuwò? Kọ "ìranran".',
    ig: 'Nyocha Azụmahịa 🚗\n\nIji nyocha azụmahịa, tinye app HiGO ma ọ bụ gaa na website anyị.\n\nChọrọ enyemaka? Pịa "enyemaka".',
    pcm: 'Book Ride 🚗\n\nTo book ride, open HiGO app or go our website.\n\nNeed help? Type "help".',
  },
  cancel_ride: {
    en: 'Cancel Ride ❌\n\nTo cancel an active ride, please contact your driver directly or use the app.\n\nNeed help? Type "help".',
    ha: 'Soke Tafiya ❌\n\nDon soke tafiya, tuntuɓi maiveya ko yi amfani da manhajar.\n\nKin yi buƙata? Rubuta "taimako".',
    yo: 'Fagile Ìrìn Àjò ❌\n\nLáti fagile ìrìn àjò, jẹ̀kí aṣọwèrè rẹ tàbí lo sí àpótí wa.\n\nNí ìfọ̀rọ̀wánilẹnuwò? Kọ "ìranran".',
    ig: 'Kagbuo Azụmahịa ❌\n\nIji kagbuo azụmahịa na-eme, tinye na-eyi gị ma ọ bụ ji app a.',
    pcm: 'Cancel Ride ❌\n\nTo cancel ride, call your driver or use app.\n\nNeed help? Type "help".',
  },
  track_ride: {
    en: 'Track Ride 📍\n\nTo track your ride, please open the HiGO app.\n\nNeed help? Type "help".',
    ha: 'Bi Diddigin Tafiya 📍\n\nDon bi diddigin tafiya, buɗe manhajar HiGO.\n\nKin yi buƙata? Rubuta "taimako".',
    yo: 'Tọ́ka sí Ìrìn Àjò 📍\n\nLáti tọ́ka sí ìrìn àjò rẹ, jọ̀wọ́ sí àpótí wa.\n\nNí ìfọ̀rọ̀wánilẹnuwò? Kọ "ìranran".',
    ig: 'Chọta Azụmahịa 📍\n\nIji chọta azụmahịa gị, tinye app HiGO.\n\nChọrọ enyemaka? Pịa "enyemaka".',
    pcm: 'Track Ride 📍\n\nTo track your ride, open HiGO app.\n\nNeed help? Type "help".',
  },
  fare_inquiry: {
    en: 'Fare Info 💰\n\nFare estimates are available in the HiGO app when you book.\n\nNeed help? Type "help".',
    ha: 'Bayanan Kudin Tafiya 💰\n\nAn sami kimanin kudin tafiya a cikin manhajar lokacin da kake yi rajista.\n\nKin yi buƙata? Rubuta "taimako".',
    yo: 'Ìmọ̀ Ọwọ́ 💰\n\nA lè rí ọwọ́ nínú àpótí wa nígbà tí o bá ń béèrè.\n\nNí ìfọ̀rọ̀wánilẹnuwò? Kọ "ìranran".',
    ig: 'Ozi Ego 💰\n\nA na-enye ozi ego n\'app HiGO mgbe ị na-akọrọ azụmahịa.\n\nChọrọ enyemaka? Pịa "enyemaka".',
    pcm: 'Fare Info 💰\n\nFare dey inside HiGO app when you book.\n\nNeed help? Type "help".',
  },
  feedback: {
    en: 'Feedback 📝\n\nWe value your feedback! Please share your experience or suggestions.\n\nType your message and we\'ll review it.',
    ha: 'Ra\'ayi 📝\n\nMuna darajar ra\'ayin ka! Bayyana lambar ka ko shawarwarin ka.\n\nRubuta saƙon ka kuma za mu duba shi.',
    yo: 'Ìṣàpèjúwe 📝\n\nA ń dáàbò bo ìṣàpèjúwe rẹ! Jọ̀wọ́ pín ìrírí rẹ tàbí ìmọ̀ràn rẹ.\n\nKọ ìkìlọ̀ rẹ ká a yóò wo.',
    ig: 'Nnyocha 📝\n\nAnyị na-enwerọ igosi nnyocha gị! Pịa ahụmahụ gị ma ọ bụ uche gị.\n\nPịa ozi gị ma anyị ga-enyochaa.',
    pcm: 'Feedback 📝\n\nWe want your feedback! Talk your experience or suggestion.\n\nType your message and we go check am.',
  },
  referral: {
    en: 'Refer a Friend 👥\n\nShare HiGO with friends and earn rewards!\n\nYour referral code: HiGO-{phone}\n\nType "menu" to go back.',
    ha: 'Kira Aboki 👥\n\nRaba HiGO da abokanka kuma sami kyauta!\n\nLambar biki ka: HiGO-{phone}\n\nRubuta "menu" don dawowa.',
    yo: 'Pe Ọrẹ 👥\n\nPín HiGO pẹ̀lú ọ̀rẹ rẹ kí o gbé ẹ̀dáyé!\n\nKòòdì rẹ: HiGO-{phone}\n\nKọ "menu" láti padà.',
    ig: 'Kpee Enyi 👥\n\nKekọrịta HiGO na enyi gị ma nata ezigbo ihe!\n\nKòòdì gị: HiGO-{phone}\n\nPịa "menu" iruo azụ.',
    pcm: 'Call Friend 👥\n\nShare HiGO with friends and get reward!\n\nYour referral code: HiGO-{phone}\n\nType "menu" to go back.',
  },
  language_change: {
    en: 'Change Language 🌍\n\nAvailable languages:\n1. English\n2. Hausa\n3. Yoruba\n4. Igbo\n5. Nigerian Pidgin\n\nType a number to select.',
    ha: 'Canja Harshe 🌌\n\nHarshen da ake samu:\n1. Turanci\n2. Hausa\n3. Yoruba\n4. Igbo\n5. Turanci Nijeriya\n\nRubuta lamba don zaɓar.',
    yo: 'Yí Èdè Ṣe 🌍\n\nÈdè tí a fún:\n1. Èdè Gẹ̀ẹ́sì\n2. Èdè Hausa\n3. Èdè Yorùbá\n4. Èdè Igbo\n5. Èdè Pidjin\n\nKọ nọ́mbà láti yan.',
    ig: 'Gbanwee Asụsụ 🌍\n\nAsụsụ dị:\n1. Bekee\n2. Hausa\n3. Yoruba\n4. Igbo\n5. Pidgin\n\nPịa ọnụọgụ iji họpụta.',
    pcm: 'Change Language 🌍\n\nLanguage wey dey:\n1. English\n2. Hausa\n3. Yoruba\n4. Igbo\n5. Nigerian Pidgin\n\nType number to choose.',
  },
  menu: {
    en: 'HiGO Menu 📋\n\n1. Book a ride\n2. Track ride\n3. Fare info\n4. Support\n5. SOS\n6. Change language\n7. Refer a friend\n\nType a number or command.',
    ha: 'HiGO Menu 📋\n\n1. Yi rajista\n2. Bi diddigin tafiya\n3. Bayanan kudi\n4. Taimako\n5. SOS\n6. Canja harshe\n7. Kira aboki\n\nRubuta lamba ko umarni.',
    yo: 'HiGO Menu 📋\n\n1. Bèèrè ìrìn àjò\n2. Tọ́ka sí ìrìn àjò\n3. Ọwọ́ ọ̀rọ̀\n4. Ìranran\n5. SOS\n6. Yí èdè Ṣe\n7. Pe ọrẹ\n\nKọ nọ́mbà tàbí ìmọ̀ràn.',
    ig: 'HiGO Menu 📋\n\n1. Nyocha azụmahịa\n2. Chọta azụmahịa\n3. Ozi ego\n4. Nnyocha\n5. SOS\n6. Gbanwee asụsụ\n7. Kpee enyi\n\nPịa ọnụọgụ ma ọ bụ ntuziaka.',
    pcm: 'HiGO Menu 📋\n\n1. Book ride\n2. Track ride\n3. Fare info\n4. Support\n5. SOS\n6. Change language\n7. Call friend\n\nType number or command.',
  },
  general_response: {
    en: 'HiGO Bot 🤖\n\nI can help you with:\n\n• Book a ride\n• Track ride\n• Fare info\n• Support\n\nType "menu" to see all options or "help" for assistance.',
    ha: 'HiGO Bot 🤖\n\nZan taimaka maka da:\n\n• Yi rajista\n• Bi diddigin tafiya\n• Bayanan kudi\n• Taimako\n\nRubuta "menu" don ganin dukkan zažužuwan ko "taimako" don taimako.',
    yo: 'HiGO Bot 🤖\n\nMo lè ran ọ lọ́wọ́ pẹ̀lú:\n\n• Bèèrè ìrìn àjò\n• Tọ́ka sí ìrìn àjò\n• Ọwọ́ ọ̀rọ̀\n• Ìranran\n\nKọ "menu" láti rí gbogbo àwọn àṣàyàn tàbí "ìranran" fún ìrànwọ́.',
    ig: 'HiGO Bot 🤖\n\nEnwere m ike inyere gị aka na:\n\n• Nyocha azụmahịa\n• Chọta azụmahịa\n• Ozi ego\n• Nnyocha\n\nPịa "menu" lebara anya n\'ọhọụrụ ma ọ bụ "enyemaka" maka enyemaka.',
    pcm: 'HiGO Bot 🤖\n\nI fit help you with:\n\n• Book ride\n• Track ride\n• Fare info\n• Support\n\nType "menu" to see all options or "help" for assistance.',
  },
  ai_fallback: {
    en: 'I\'m having trouble understanding. Let me connect you with a support agent.\n\nPlease type "help" for options or wait for a human agent.',
    ha: 'Na samu matsali wajen fahimta. Bar ni haɗa ka da mai taimako.\n\nRubuta "taimako" don zažužuwan ko jira mutum.',
    yo: 'Mo ní ìṣòro láti mọ̀. Jẹ́ kí a so pọ̀ pẹ̀lú ẹni tó lè ran ọ lọ́wọ́.\n\nKọ "ìranran" fún àwọn àṣàyàn tàbí dúró fún ẹni tó lè ran ọ lọ́wọ́.',
    ig: 'Enwere m nsogbu ịghọta. Ka m jikọọ gị na onye nyochaa.\n\nTinye "enyemaka" makaọhọụrụ ma ọ bụ chere onye enyemaka.',
    pcm: 'I no fit understand well. Make I connect you with support person.\n\nType "help" for options or wait for person.',
  },
};
