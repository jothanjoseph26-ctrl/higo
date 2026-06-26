/**
 * HiGo Abuja — Shared Domain Types
 * Package: @higo/shared-types
 *
 * Single source of truth for domain entities consumed by:
 *   apps/api (NestJS), apps/passenger-app, apps/driver-app, apps/admin-dashboard
 *
 * RULES:
 * - All monetary values are KOBO (integer). Never floats. 1 NGN = 100 kobo.
 * - All timestamps are ISO-8601 strings on the wire (Date in DB).
 * - Geo coordinates use { lat, lng } (WGS84 / SRID 4326).
 */

import {
  TripStatus,
  KYCStatus,
  VehicleType,
  ZoneType,
  SubscriptionTier,
  DisputeStatus,
  DisputeRaisedBy,
  AdminRole,
  PaymentMethod,
  PaymentStatus,
  UserType,
  VerificationTier,
  PromoDiscountType,
  ConversationType,
  MessageSenderType,
  ReferralStatus,
  DriverFeatureName,
  PartnerType,
  PartnerStatus,
  SupportTicketCategory,
  SupportTicketStatus,
  FraudEventType,
  FraudSeverity,
  FraudEventStatus,
  LanguageCode,
  LandmarkType,
  HceService,
} from './enums';

// ============================================================================
// RE-EXPORT ALL ENUMS (barrel convenience)
// ============================================================================
export {
  TripStatus,
  KYCStatus,
  VehicleType,
  ZoneType,
  SubscriptionTier,
  DisputeStatus,
  DisputeRaisedBy,
  AdminRole,
  PaymentMethod,
  PaymentStatus,
  UserType,
  VerificationTier,
  PromoDiscountType,
  ConversationType,
  MessageSenderType,
  ReferralStatus,
  DriverFeatureName,
  PartnerType,
  PartnerStatus,
  SupportTicketCategory,
  SupportTicketStatus,
  FraudEventType,
  FraudSeverity,
  FraudEventStatus,
  ActivityStatus,
  LanguageCode,
  LandmarkType,
  ComplianceEventType,
  NotificationType,
  HceService,
} from './enums';

// ============================================================================
// PRIMITIVES
// ============================================================================

export interface LatLng {
  lat: number;
  lng: number;
}

/** Encoded Google polyline string. */
export type Polyline = string;

/** ISO-8601 date-time string, e.g. "2026-06-20T10:15:00.000Z". */
export type ISODateString = string;

/** UUID v4 string. */
export type UUID = string;

/** Monetary amount in kobo (integer). */
export type Kobo = number;

// ============================================================================
// EMBEDDED / VALUE OBJECTS
// ============================================================================

export interface EmergencyContact {
  name: string;
  phone: string;
  relationship?: string;
}

export type SavedPlaceLabel = 'home' | 'work';

export interface SavedPlace {
  label: SavedPlaceLabel;
  address: string;
  lat: number;
  lng: number;
}

/** AES-256-GCM encrypted blob as stored in JSONB columns. */
export interface EncryptedField {
  iv: string; // base64
  tag: string; // base64
  ciphertext: string; // base64
}

export interface KycDocumentMeta {
  docType: string; // KycDocType value
  s3Key: string;
  status: KYCStatus;
  rejectionCode?: string;
  rejectionReason?: string;
  uploadedAt: ISODateString;
  reviewedAt?: ISODateString;
  reviewedBy?: UUID;
  ocrFields?: Record<string, string>; // Tesseract OCR auto-fill
}

export interface BankDetails {
  accountNumber: string;
  bankCode: string;
  accountName: string;
}

// ============================================================================
// CORE ENTITIES
// ============================================================================

export interface User {
  id: UUID;
  phone: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  fcmToken: string | null;
  preferredLanguage: string; // LanguageCode value
  higoPoints: number;
  ratingAvg: number;
  totalTrips: number;
  isVerified: boolean;
  isBlocked: boolean;
  emergencyContacts: EmergencyContact[] | null;
  savedPlaces: SavedPlace[] | null;

  // Risk mitigation additions (Risk 13 — fraud)
  fraudRiskLevel: string; // 'normal' | 'elevated' | 'high'
  refundRequestCount: number;
  disputeRate: number;

  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface Driver {
  id: UUID;
  userId: UUID | null;
  name: string;
  phone: string;
  email: string | null;
  avatarUrl: string | null;
  fcmToken: string | null;

  vehicleType: VehicleType;
  vehiclePlate: string;
  vehicleModel: string | null;
  vehicleYear: number | null;
  vehicleColor: string | null;

  kycStatus: KYCStatus;
  kycDocuments: Record<string, KycDocumentMeta> | null;
  verificationTier: VerificationTier;

  // Encrypted sensitive data
  ninEncrypted: EncryptedField | null;
  bankDetailsEncrypted: EncryptedField | null;
  paystackRecipientCode: string | null;

  ratingAvg: number;
  totalTrips: number;
  isOnline: boolean;
  isActive: boolean;
  isSuspended: boolean;

  subscriptionTier: SubscriptionTier | null;
  subscriptionExpiresAt: ISODateString | null;

  operatingZoneIds: UUID[];

  /** Latest known location (resolved from PostGIS / Redis hot state). */
  currentLocation: LatLng | null;

  // Risk mitigation additions (Risk 1 — referral)
  referralCode: string | null;

  // Risk mitigation additions (Risk 13 — fraud)
  fraudRiskScore: number;
  fraudFlags: string[];

  // Device fingerprinting (Risk 13)
  deviceId: string | null;
  deviceIdLocked: boolean;

  // Composite Trust Score components (Agent 2 matching engine)
  compositeScore: number | null;
  punctualityScore: number | null;
  complaintRate: number | null;
  acceptanceRate: number | null;
  completionRate: number | null;
  consecutiveRejections: number;

  // Financial
  feeOwed: number; // kobo

  // Activity tracking (recalculated nightly)
  activityStatus: string; // ActivityStatus value
  lastTripAt: ISODateString | null;
  tripsLast7Days: number;

  // Subscription loyalty
  subscriptionLoyaltyMonths: number;

  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface Trip {
  id: UUID;
  passengerId: UUID;
  driverId: UUID | null;

  pickupLocation: LatLng;
  pickupAddress: string;
  destinationLocation: LatLng;
  destinationAddress: string;

  routePolyline: Polyline | null;
  distanceKm: number | null;
  durationMin: number | null;

  vehicleType: VehicleType;
  status: TripStatus;

  // All fares in KOBO (integer)
  baseFare: Kobo;
  distanceFare: Kobo;
  timeFare: Kobo;
  surgeMultiplier: number;
  totalFare: Kobo;

  paymentMethod: PaymentMethod | null;
  paymentStatus: PaymentStatus;
  paystackReference: string | null;

  passengerRating: number | null; // 1..5 given BY driver TO passenger
  driverRating: number | null; // 1..5 given BY passenger TO driver

  rideSharePartnerId: UUID | null;
  isShared: boolean;

  startedAt: ISODateString | null;
  completedAt: ISODateString | null;
  cancelledAt: ISODateString | null;
  cancelReason: string | null;

  // Pickup enrichment (Risk 10 — pickup accuracy)
  pickupLandmark: string | null;
  pickupVoiceNoteUrl: string | null;
  pickupConfirmedAt: ISODateString | null;
  pickupAttempts: number;

  // Actual pickup (may differ from requested)
  actualPickupLocation: LatLng | null;

  // Cash confirmation (Risk — cash fraud)
  cashConfirmedByDriver: boolean;
  cashConfirmedAt: ISODateString | null;

  // Driver rejection tracking
  rejectionReason: string | null;

  createdAt: ISODateString;
}

export interface DriverLocation {
  id: UUID;
  driverId: UUID;
  location: LatLng;
  bearing: number | null;
  speed: number | null;
  accuracy: number | null;
  recordedAt: ISODateString;
}

export interface Zone {
  id: UUID;
  name: string;
  zoneType: ZoneType;
  /** Polygon ring(s) as GeoJSON-style coordinate paths. */
  boundary: LatLng[];
  surgeMultiplier: number;
  isActive: boolean;
  createdAt: ISODateString;
}

export interface PricingConfig {
  id: UUID;
  vehicleType: VehicleType;
  baseFare: Kobo;
  perKmFare: Kobo;
  perMinFare: Kobo;
  minFare: Kobo;
  currency: 'NGN';
  isActive: boolean;
  updatedAt: ISODateString;
}

export interface SurgeRule {
  id: UUID;
  zoneId: UUID;
  dayOfWeek: number; // 0=Sun .. 6=Sat
  startTime: string; // 'HH:MM:SS'
  endTime: string; // 'HH:MM:SS'
  multiplier: number;
  isActive: boolean;
}

export interface Subscription {
  id: UUID;
  driverId: UUID;
  tier: SubscriptionTier;
  amount: Kobo;
  paystackSubscriptionCode: string | null;
  startedAt: ISODateString;
  expiresAt: ISODateString;
  isActive: boolean;
  autoRenew: boolean;
}

export interface Dispute {
  id: UUID;
  tripId: UUID;
  raisedBy: DisputeRaisedBy;
  type: string;
  description: string;
  evidenceUrls: string[] | null;
  status: DisputeStatus;
  resolution: string | null;
  resolvedBy: UUID | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface Notification {
  id: UUID;
  userId: UUID;
  userType: UserType;
  title: string;
  body: string;
  type: string; // NotificationType value
  data: Record<string, unknown> | null;
  isRead: boolean;
  sentAt: ISODateString | null;
  createdAt: ISODateString;
}

export interface AdminUser {
  id: UUID;
  name: string;
  email: string;
  role: AdminRole;
  isActive: boolean;
  lastLogin: ISODateString | null;
  createdAt: ISODateString;
  // passwordHash never serialised to the client
}

export interface FinancialAudit {
  id: UUID;
  action: string;
  actorId: UUID | null;
  actorType: string | null;
  reference: string;
  amount: Kobo | null;
  beforeStatus: string | null;
  afterStatus: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: ISODateString;
}

export interface ComplianceAudit {
  id: UUID;
  driverId: UUID;
  docType: string | null;
  action: string; // ComplianceEventType value
  actorId: UUID | null;
  actorType: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: ISODateString;
}

export interface PlatformSettings {
  id: 'default';
  settings: Record<string, unknown>;
  updatedAt: ISODateString;
}

export interface PromoCode {
  id: UUID;
  code: string;
  discountType: PromoDiscountType;
  discountValue: number; // basis points (percent) or kobo (fixed)
  maxUses: number | null;
  usedCount: number;
  expiresAt: ISODateString | null;
  isActive: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface Conversation {
  id: UUID;
  tripId: UUID | null;
  passengerId: UUID;
  driverId: UUID | null;
  type: ConversationType;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface Message {
  id: UUID;
  conversationId: UUID;
  senderId: UUID;
  senderType: MessageSenderType;
  body: string;
  createdAt: ISODateString;
}

// ============================================================================
// RISK MITIGATION ENTITIES
// ============================================================================

/** Driver referral programme (Risk 1). */
export interface DriverReferral {
  id: UUID;
  referrerDriverId: UUID;
  referredDriverId: UUID;
  referralCode: string;
  status: ReferralStatus;
  rewardAmount: Kobo;
  rewardedAt: ISODateString | null;
  createdAt: ISODateString;
}

/** Driver feature interest registry — HiGo Plus stubs (Risk 17). */
export interface DriverFeatureInterest {
  id: UUID;
  driverId: UUID;
  featureName: DriverFeatureName;
  registeredAt: ISODateString;
}

/** Community and union partners (Risk 19). */
export interface CommunityPartner {
  id: UUID;
  partnerType: PartnerType;
  name: string;
  contactPerson: string;
  contactPhone: string;
  zoneId: UUID | null;
  status: PartnerStatus;
  membersCount: number;
  driversReferred: number;
  consumersReferred: number;
  agreementSigned: boolean;
  notes: string | null;
  createdAt: ISODateString;
  lastContactAt: ISODateString | null;
}

/** Customer support tickets (Risk 7). */
export interface SupportTicket {
  id: UUID;
  tripId: UUID | null;
  raisedByUserId: UUID;
  raisedByType: UserType;
  category: SupportTicketCategory;
  description: string;
  status: SupportTicketStatus;
  assignedToAdminId: UUID | null;
  resolution: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  resolvedAt: ISODateString | null;
}

/** Fraud event log (Risk 13). */
export interface FraudEvent {
  id: UUID;
  eventType: FraudEventType;
  driverId: UUID | null;
  passengerId: UUID | null;
  tripId: UUID | null;
  severity: FraudSeverity;
  description: string;
  metadata: Record<string, unknown> | null;
  status: FraudEventStatus;
  createdAt: ISODateString;
  resolvedAt: ISODateString | null;
}

/** Passenger fare watch alerts for surge (Risk 10). */
export interface FareWatchAlert {
  id: UUID;
  passengerId: UUID;
  zoneId: UUID;
  targetMultiplier: number;
  createdAt: ISODateString;
  triggeredAt: ISODateString | null;
  expiresAt: ISODateString;
}

/** Daily revenue snapshot (Risk 15). */
export interface RevenueDailySummary {
  date: ISODateString;
  grossGmv: Kobo;
  platformCommission: Kobo;
  subscriptionRevenue: Kobo;
  verificationRevenue: Kobo;
  cashFeeCollected: Kobo;
  cashFeeOutstanding: Kobo;
  refundsIssued: Kobo;
  netRevenue: Kobo;
  activeDrivers: number;
  completedTrips: number;
  avgTripValue: Kobo;
  createdAt: ISODateString;
}

// ============================================================================
// HCE (HICONNECT COMMUNICATION ENGINE) ENTITIES
// ============================================================================

/** Per-user language and voice preferences. */
export interface UserLanguagePreference {
  userId: UUID;
  userType: UserType;
  languageCode: LanguageCode;
  voiceGender: 'male' | 'female';
  autoReadoutEnabled: boolean;
  updatedAt: ISODateString;
}

/** Abuja landmark database entry. */
export interface LandmarkDatabase {
  id: UUID;
  name: string;
  aliases: string[];
  zone: string;
  lat: number;
  lng: number;
  landmarkType: LandmarkType;
  verified: boolean;
  usageCount: number;
  createdAt: ISODateString;
}

/** Landmark resolution audit (how well the AI resolved a raw description). */
export interface LandmarkResolution {
  id: UUID;
  rawDescription: string;
  resolvedLandmarkId: UUID | null;
  confidenceScore: number;
  wasCorrect: boolean | null;
  tripId: UUID | null;
  createdAt: ISODateString;
}

/** HCE API usage and cost tracking. */
export interface HceUsageLog {
  id: UUID;
  userId: UUID;
  serviceUsed: HceService;
  tokensConsumed: number;
  costUsd: number;
  durationMs: number;
  createdAt: ISODateString;
}

/** Driver vocabulary — personal landmarks learned from usage. */
export interface DriverVocabulary {
  id: UUID;
  driverId: UUID;
  term: string;
  resolvedLat: number;
  resolvedLng: number;
  usageCount: number;
  lastUsedAt: ISODateString;
}

// ============================================================================
// COMPOSITE / DERIVED
// ============================================================================

/** Trust score breakdown produced by the matching engine (Agent 2). */
export interface CompositeTrustScore {
  driverId: UUID;
  referralProximity: number; // 0..1
  estateEndorsement: number; // 0..1
  completionRate: number; // 0..1
  recencyActivity: number; // 0..1
  ratingScore: number; // 0..1
  geoProximity: number; // 0..1
  verificationTier: number; // 0..1
  jobVolumeSignal: number; // 0..1
  /** Weighted composite, 0..1. */
  total: number;
}

/** Ranked candidate emitted by the matching engine before dispatch. */
export interface RankedCandidate {
  driverId: UUID;
  distanceMeters: number;
  cts: CompositeTrustScore;
}

/** Minimal driver detail sent to passenger on match. */
export interface MatchedDriverDetails {
  driverId: UUID;
  name: string;
  phone: string;
  avatarUrl: string | null;
  vehiclePlate: string;
  vehicleModel: string | null;
  vehicleColor: string | null;
  ratingAvg: number;
  totalTrips: number;
}

/** Weekly KPI snapshot for admin dashboard. */
export interface WeeklyKpi {
  driverActiveRate: number;
  rideCompletionRate: number;
  avgPassengerWaitMinutes: number;
  customerAcquisitionCost: Kobo;
  cashBurnVsRevenue: number;
  period: { from: ISODateString; to: ISODateString };
}

/** Booking intent extracted from voice by HCE IntentService. */
export interface BookingIntent {
  destination: string | null;
  lat: number | null;
  lng: number | null;
  vehicleType: VehicleType | null;
  confidence: number;
}
