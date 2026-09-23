export enum ConversationState {
  // Registration (existing)
  IDLE = 'idle',
  AWAITING_PASSENGER_NAME = 'awaiting_passenger_name',
  AWAITING_PASSENGER_CITY = 'awaiting_passenger_city',
  AWAITING_PASSENGER_REFERRAL = 'awaiting_passenger_referral',
  AWAITING_DRIVER_NAME = 'awaiting_driver_name',
  AWAITING_DRIVER_VEHICLE = 'awaiting_driver_vehicle',
  AWAITING_DRIVER_CITY = 'awaiting_driver_city',

  // Booking flow (new)
  AWAITING_PICKUP = 'awaiting_pickup',
  AWAITING_DESTINATION = 'awaiting_destination',
  SELECTING_VEHICLE = 'selecting_vehicle',
  CONFIRMING_RIDE = 'confirming_ride',
  SELECTING_PAYMENT = 'selecting_payment',
  WAITING_FOR_MATCH = 'waiting_for_match',
  TRIP_ACTIVE = 'trip_active',
  AWAITING_RATING = 'awaiting_rating',
  BOOKING_COMPLETED = 'booking_completed',

  // Driver-specific states
  DRIVER_IDLE = 'driver_idle',
  DRIVER_ONLINE = 'driver_online',
  DRIVER_INCOMING_REQUEST = 'driver_incoming_request',
  DRIVER_ACCEPTED_TRIP = 'driver_accepted_trip',
  DRIVER_NAVIGATING_TO_PICKUP = 'driver_navigating_to_pickup',
  DRIVER_ARRIVED = 'driver_arrived',
  DRIVER_TRIP_IN_PROGRESS = 'driver_trip_in_progress',
  DRIVER_AWAITING_PASSENGER_RATING = 'driver_awaiting_passenger_rating',

  // Special
  HUMAN_HANDOFF = 'human_handoff',
}

// Backward compatibility — old code referencing WhatsAppConversationState still works
export const WhatsAppConversationState = ConversationState;

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
          location?: {
            latitude: number;
            longitude: number;
            name?: string;
            address?: string;
            url?: string;
          };
          interactive?: {
            type: string;
            button_reply?: { id: string; title: string };
            list_reply?: { id: string; title: string; description: string };
          };
          }>;
          context?: {
            from: string;
            id: string;
          };
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

export interface WhatsAppButton {
  id: string;
  title: string;
}

export interface WhatsAppListRow {
  id: string;
  title: string;
  description?: string;
}

export interface WhatsAppListSection {
  title: string;
  rows: WhatsAppListRow[];
}

export interface ParsedInboundMessage {
  type: 'text' | 'location' | 'interactive' | 'unknown';
  text?: string;
  location?: {
    lat: number;
    lng: number;
    address?: string;
    name?: string;
  };
  buttonId?: string;
  buttonTitle?: string;
  listRowId?: string;
  listRowTitle?: string;
  messageId: string;
  timestamp: string;
}

export interface ActiveBooking {
  pickup?: { lat: number; lng: number; address: string };
  destination?: { lat: number; lng: number; address: string };
  vehicleType?: string;
  fareEstimate?: {
    baseFare: number;
    distanceFare: number;
    timeFare: number;
    rawFare: number;
    totalFare: number;
    distanceKm: number;
    durationMin: number;
    surgeMultiplier: number;
  };
  paymentMethod?: string;
  promoCode?: string;
  tripId?: string;
  startedAt?: string;
  pickupOptions?: Array<{ placeId: string; description: string }>;
  destinationOptions?: Array<{ placeId: string; description: string }>;
}

export interface BookingResponse {
  state: ConversationState;
  messages: BookingMessage[];
  clearBooking?: boolean;
}

export interface BookingMessage {
  type: 'text' | 'buttons' | 'list' | 'location' | 'link';
  text?: string;
  title?: string;
  description?: string;
  buttons?: WhatsAppButton[];
  listSections?: WhatsAppListSection[];
  listButtonText?: string;
  location?: { lat: number; lng: number; name: string; address: string };
  link?: string;
}
