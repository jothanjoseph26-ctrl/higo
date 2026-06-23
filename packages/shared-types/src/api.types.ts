/**
 * HiGo Abuja — Shared API Request/Response DTOs
 * Package: @higo/shared-types
 *
 * Every REST endpoint listed in the API contract has a request and/or response
 * type here. Consumed by the api-client lib, the backend controllers, and all
 * three front-ends.
 *
 * Convention: <Verb><Resource>Request / <Verb><Resource>Response.
 */

import {
  LatLng,
  ISODateString,
  UUID,
  Kobo,
  User,
  Driver,
  Trip,
  Zone,
  PricingConfig,
  Dispute,
  Notification,
  EmergencyContact,
  VehicleType,
  PaymentMethod,
  PaymentStatus,
  SupportedLanguage,
  SubscriptionTier,
  KYCStatus,
  KycDocType,
  KycRejectionCode,
  VerificationTier,
  ZoneType,
  DisputeStatus,
  MatchedDriverDetails,
} from './domain.types';

// ============================================================================
// GENERIC ENVELOPES
// ============================================================================

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: {
    /** Machine-readable code, e.g. "ZONE_RESTRICTED". */
    code: string;
    /** User-facing message (may be Pidgin for passenger/driver flows). */
    message: string;
    /** Optional field-level validation details. */
    details?: Record<string, string[]>;
    /** HTTP status mirrored for clients that lose it. */
    statusCode: number;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

/** Cursor-based pagination (20 items/page). */
export interface PaginatedResponse<T> {
  items: T[];
  pageInfo: {
    /** Opaque cursor for the next page; null if last page. */
    nextCursor: string | null;
    hasNextPage: boolean;
    /** Items in this page. */
    count: number;
  };
}

export interface PaginationQuery {
  cursor?: string;
  limit?: number; // default & max 20
}

export interface DateRangeQuery {
  from?: ISODateString;
  to?: ISODateString;
}

// ============================================================================
// AUTH
// ============================================================================

export interface SendOtpRequest {
  phone: string; // E.164, e.g. +2348012345678
  userType: 'passenger' | 'driver';
}

export interface SendOtpResponse {
  sent: boolean;
  expiresInSeconds: number; // 300
  /** Channel actually used after fallback logic. */
  channel: 'termii' | 'africastalking';
}

export interface VerifyOtpRequest {
  phone: string;
  code: string; // 6 digits
  userType: 'passenger' | 'driver';
}

export interface AuthTokens {
  accessToken: string; // JWT, 15min
  /** Only returned in body for mobile; web receives httpOnly cookie. */
  refreshToken?: string;
  accessTokenExpiresIn: number; // seconds (900)
}

export interface VerifyOtpResponse extends AuthTokens {
  isNewUser: boolean;
  user?: User;
  driver?: Driver;
}

export interface GoogleAuthRequest {
  idToken: string; // Google ID token
  userType: 'passenger' | 'driver';
}

export type GoogleAuthResponse = VerifyOtpResponse;

export interface RefreshTokenRequest {
  /** Mobile sends in body; web uses httpOnly cookie. */
  refreshToken?: string;
}

export type RefreshTokenResponse = AuthTokens;

export interface LogoutRequest {
  refreshToken?: string;
}

export interface LogoutResponse {
  loggedOut: boolean;
}

// ============================================================================
// PASSENGERS
// ============================================================================

export type GetMyProfileResponse = User;

export interface UpdateMyProfileRequest {
  name?: string;
  email?: string;
  avatarUrl?: string;
  preferredLanguage?: SupportedLanguage;
  fcmToken?: string;
}

export type UpdateMyProfileResponse = User;

export type GetMyTripsResponse = PaginatedResponse<Trip>;

export interface SetEmergencyContactsRequest {
  contacts: EmergencyContact[]; // max 3
}

export interface SetEmergencyContactsResponse {
  contacts: EmergencyContact[];
}

// ============================================================================
// DRIVERS
// ============================================================================

export type GetDriverProfileResponse = Driver;

export interface UpdateDriverProfileRequest {
  name?: string;
  email?: string;
  avatarUrl?: string;
  fcmToken?: string;
  vehicleModel?: string;
  vehicleYear?: number;
  vehicleColor?: string;
  bankDetails?: {
    accountNumber: string;
    bankCode: string;
    accountName: string;
  };
}

export type UpdateDriverProfileResponse = Driver;

export interface PostDriverLocationRequest {
  lat: number;
  lng: number;
  bearing?: number;
  speed?: number;
  accuracy?: number;
}

export interface PostDriverLocationResponse {
  accepted: boolean;
}

export interface SetOnlineStatusRequest {
  isOnline: boolean;
}

export interface SetOnlineStatusResponse {
  isOnline: boolean;
  /** Present when going online is blocked. */
  blockedReason?: 'KYC_INCOMPLETE' | 'SUBSCRIPTION_EXPIRED' | 'DRIVER_SUSPENDED';
}

export interface EarningEntry {
  tripId: UUID;
  date: ISODateString;
  grossFare: Kobo;
  platformFee: Kobo;
  driverPayout: Kobo;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
}

export type GetEarningsResponse = PaginatedResponse<EarningEntry>;

export interface GetEarningsSummaryQuery {
  date?: 'today' | 'week' | 'month' | ISODateString;
}

export interface GetEarningsSummaryResponse {
  period: string;
  totalTrips: number;
  grossEarnings: Kobo;
  platformFee: Kobo;
  netPayout: Kobo;
  /** AI-generated Pidgin summary string. */
  summary: string;
  daily: Array<{ date: ISODateString; trips: number; net: Kobo }>;
}

// ============================================================================
// KYC
// ============================================================================

export interface KycUploadResponse {
  docType: KycDocType;
  s3Key: string;
  status: KYCStatus;
  /** Textract auto-fill key-value payload. */
  ocrFields?: Record<string, string>;
}

export interface GetKycStatusResponse {
  kycStatus: KYCStatus;
  verificationTier: VerificationTier;
  documents: Array<{
    docType: KycDocType;
    status: KYCStatus;
    rejectionCode?: KycRejectionCode;
    rejectionReason?: string;
    uploadedAt: ISODateString | null;
  }>;
}

export interface ReviewKycRequest {
  documents: Array<{
    docType: KycDocType;
    decision: 'approve' | 'reject';
    rejectionCode?: KycRejectionCode;
    rejectionReason?: string;
  }>;
}

export interface ReviewKycResponse {
  driverId: UUID;
  kycStatus: KYCStatus;
  verificationTier: VerificationTier;
}

// ============================================================================
// TRIPS
// ============================================================================

export interface RequestTripRequest {
  pickup: LatLng;
  pickupAddress: string;
  destination: LatLng;
  destinationAddress: string;
  vehicleType: VehicleType;
  paymentMethod: PaymentMethod;
  isShared?: boolean;
}

export interface FareEstimate {
  baseFare: Kobo;
  distanceFare: Kobo;
  timeFare: Kobo;
  surgeMultiplier: number;
  totalFare: Kobo;
  distanceKm: number;
  durationMin: number;
}

export interface RequestTripResponse {
  trip: Trip;
  estimate: FareEstimate;
}

export interface CancelTripRequest {
  reason: string;
}

export interface CancelTripResponse {
  trip: Trip;
  cancellationFee?: Kobo;
}

export type GetTripResponse = Trip;

export interface GetTripStatusResponse {
  tripId: UUID;
  status: Trip['status'];
  driver?: MatchedDriverDetails;
  driverLocation?: LatLng & { bearing?: number; etaMin?: number };
}

export interface RateDriverRequest {
  rating: number; // 1..5
  comment?: string;
}

export interface RatePassengerRequest {
  rating: number; // 1..5
  comment?: string;
}

export interface RateResponse {
  recorded: boolean;
  newAverage: number;
}

export interface TripSosRequest {
  location: LatLng;
  note?: string;
}

export interface TripSosResponse {
  alertId: UUID;
  contactsNotified: number;
  controlRoomNotified: boolean;
}

// ============================================================================
// PAYMENTS
// ============================================================================

export interface InitializePaymentRequest {
  tripId: UUID;
  paymentMethod: PaymentMethod;
}

export interface InitializePaymentResponse {
  reference: string;
  /** Paystack authorization URL / access code for the SDK sheet. */
  authorizationUrl: string;
  accessCode: string;
  amount: Kobo;
}

/** Raw Paystack webhook payload is provider-shaped; handler typing only. */
export interface PaystackWebhookEvent {
  event: string; // e.g. "charge.success", "transfer.success"
  data: Record<string, unknown>;
}

export interface WebhookAck {
  received: true;
}

export interface CreateSubscriptionRequest {
  tier: SubscriptionTier;
  autoRenew?: boolean;
}

export interface CreateSubscriptionResponse {
  subscriptionCode: string;
  authorizationUrl: string;
  amount: Kobo;
  expiresAt: ISODateString;
}

export interface RenewSubscriptionRequest {
  tier: SubscriptionTier;
}

export type RenewSubscriptionResponse = CreateSubscriptionResponse;

export interface WithdrawRequest {
  amount: Kobo; // must be <= available payout balance
}

export interface WithdrawResponse {
  transferReference: string;
  amount: Kobo;
  status: 'queued' | 'processing' | 'success';
}

export interface TransactionEntry {
  reference: string;
  tripId: UUID | null;
  type: 'charge' | 'transfer' | 'subscription' | 'refund';
  amount: Kobo;
  status: PaymentStatus | 'success' | 'queued';
  method: PaymentMethod | null;
  createdAt: ISODateString;
}

export type GetTransactionsResponse = PaginatedResponse<TransactionEntry>;

// ============================================================================
// ADMIN
// ============================================================================

export interface AdminLoginRequest {
  email: string;
  password: string;
}

export interface AdminLoginResponse extends AuthTokens {
  admin: {
    id: UUID;
    name: string;
    email: string;
    role: 'super_admin' | 'admin' | 'moderator';
  };
}

export interface DashboardOverviewResponse {
  activeTrips: number;
  onlineDrivers: number;
  totalDriversApproved: number;
  totalPassengers: number;
  tripsToday: number;
  grossRevenueToday: Kobo;
  platformFeeToday: Kobo;
  openDisputes: number;
  pendingKyc: number;
  tripTrend: Array<{ date: ISODateString; trips: number }>;
  earningsTrend: Array<{ date: ISODateString; gross: Kobo; fee: Kobo }>;
  zoneDistribution: Array<{ zoneName: string; trips: number }>;
}

export interface AdminListDriversQuery extends PaginationQuery {
  kycStatus?: KYCStatus;
  isOnline?: boolean;
  isSuspended?: boolean;
  search?: string;
}

export type AdminListDriversResponse = PaginatedResponse<Driver>;

export interface SuspendDriverRequest {
  reason: string;
}

export interface SuspendDriverResponse {
  driverId: UUID;
  isSuspended: boolean;
}

export interface ReinstateDriverResponse {
  driverId: UUID;
  isSuspended: boolean;
}

export interface AdminListPassengersQuery extends PaginationQuery {
  isBlocked?: boolean;
  search?: string;
}

export type AdminListPassengersResponse = PaginatedResponse<User>;

export interface LiveTrip {
  tripId: UUID;
  status: Trip['status'];
  driverId: UUID | null;
  driverLocation: LatLng | null;
  pickup: LatLng;
  destination: LatLng;
  passengerId: UUID;
  startedAt: ISODateString | null;
}

export interface GetLiveTripsResponse {
  trips: LiveTrip[];
}

export interface ResolveDisputeRequest {
  status: DisputeStatus;
  resolution: string;
  /** Optional refund triggered as part of resolution. */
  refundAmount?: Kobo;
}

export type ResolveDisputeResponse = Dispute;

export interface AdminListDisputesQuery extends PaginationQuery {
  status?: DisputeStatus;
}

export type AdminListDisputesResponse = PaginatedResponse<Dispute>;

export interface FinancialReportQuery extends DateRangeQuery {
  groupBy?: 'day' | 'week' | 'month';
}

export interface FinancialReportResponse {
  range: { from: ISODateString; to: ISODateString };
  totals: {
    gross: Kobo;
    platformFee: Kobo;
    driverPayout: Kobo;
    refunds: Kobo;
    subscriptionRevenue: Kobo;
    trips: number;
  };
  series: Array<{
    period: ISODateString;
    gross: Kobo;
    platformFee: Kobo;
    driverPayout: Kobo;
    trips: number;
  }>;
}

export interface UpdatePricingRequest {
  vehicleType: VehicleType;
  baseFare: Kobo;
  perKmFare: Kobo;
  perMinFare: Kobo;
  minFare: Kobo;
}

export type UpdatePricingResponse = PricingConfig;

export interface CreateZoneRequest {
  name: string;
  zoneType: ZoneType;
  /** Polygon ring; first/last point auto-closed server-side. */
  boundary: LatLng[];
  surgeMultiplier?: number;
}

export interface UpdateZoneRequest {
  name?: string;
  zoneType?: ZoneType;
  boundary?: LatLng[];
  surgeMultiplier?: number;
  isActive?: boolean;
}

export type ZoneResponse = Zone;

export interface DeleteZoneResponse {
  deleted: boolean;
  zoneId: UUID;
}

export interface BroadcastNotificationRequest {
  audience: 'all_passengers' | 'all_drivers' | 'online_drivers' | 'zone';
  zoneId?: UUID; // required when audience === 'zone'
  title: string;
  body: string;
  type: string;
  data?: Record<string, unknown>;
}

export interface BroadcastNotificationResponse {
  recipients: number;
  queued: boolean;
}

export type GetNotificationsResponse = PaginatedResponse<Notification>;
