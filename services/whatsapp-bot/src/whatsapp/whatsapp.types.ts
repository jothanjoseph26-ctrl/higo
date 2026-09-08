export enum WhatsAppConversationState {
  IDLE = 'idle',
  AWAITING_PASSENGER_NAME = 'awaiting_passenger_name',
  AWAITING_PASSENGER_CITY = 'awaiting_passenger_city',
  AWAITING_PASSENGER_REFERRAL = 'awaiting_passenger_referral',
  AWAITING_DRIVER_NAME = 'awaiting_driver_name',
  AWAITING_DRIVER_VEHICLE = 'awaiting_driver_vehicle',
  AWAITING_DRIVER_CITY = 'awaiting_driver_city',
  HUMAN_HANDOFF = 'human_handoff',
}

export enum WhatsAppRole {
  PASSENGER = 'passenger',
  DRIVER = 'driver',
  DISPATCH = 'dispatch',
  UNKNOWN = 'unknown',
}

export enum ErrorType {
  NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',
  RATE_LIMIT = 'RATE_LIMIT',
  API_UNAVAILABLE = 'API_UNAVAILABLE',
  TEMPORARY_FAILURE = 'TEMPORARY_FAILURE',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  INVALID_PHONE = 'INVALID_PHONE',
  MESSAGE_TOO_LONG = 'MESSAGE_TOO_LONG',
  TEMPLATE_NOT_FOUND = 'TEMPLATE_NOT_FOUND',
  AI_RESPONSE_FAILED = 'AI_RESPONSE_FAILED',
  CONVERSATION_NOT_FOUND = 'CONVERSATION_NOT_FOUND',
  CONFIG_MISSING = 'CONFIG_MISSING',
  AUTH_EXPIRED = 'AUTH_EXPIRED',
  WEBHOOK_REJECTED = 'WEBHOOK_REJECTED',
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface ErrorClassification {
  type: ErrorType;
  severity: ErrorSeverity;
  retryable: boolean;
}

export interface HealthStatus {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: Date;
  latency: number;
  errorRate: number;
  consecutiveFailures: number;
}

export interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  state: 'closed' | 'open' | 'half-open';
  successCount: number;
}

export interface ErrorRecord {
  timestamp: number;
  type: ErrorType;
  severity: ErrorSeverity;
  message: string;
  context?: Record<string, unknown>;
  resolved: boolean;
}

export interface WhatsAppMessagePayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts: Array<{
          profile: { name: string };
          wa_id: string;
        }>;
        messages: Array<{
          from: string;
          id: string;
          timestamp: string;
          type: string;
          text?: { body: string };
          image?: { id: string; mime_type: string; caption?: string };
          audio?: { id: string; mime_type: string };
          interactive?: {
            type: string;
            button_reply?: { id: string; title: string };
            list_reply?: { id: string; title: string; description: string };
          };
        }>;
        statuses: Array<{
          id: string;
          status: string;
          timestamp: string;
          recipient_id: string;
        }>;
      };
      field: string;
    }>;
  }>;
}
