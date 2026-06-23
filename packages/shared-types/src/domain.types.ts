/**
 * HiGo Abuja — Shared Domain Types
 * Package: @higo/shared-types
 *
 * Single source of truth for domain entities and enums consumed by:
 *   apps/api (NestJS), apps/passenger-app, apps/driver-app, apps/admin-dashboard
 *
 * RULES:
 * - All monetary values are KOBO (integer). Never floats. 1 NGN = 100 kobo.
 * - All timestamps are ISO-8601 strings on the wire (Date in DB).
 * - Geo coordinates use { lat, lng } (WGS84 / SRID 4326).
 */

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
// ENUMS (mirror schema.prisma)
// ============================================================================

export enum TripStatus {
  REQUESTED = 'requested',
  MATCHED = 'matched',
  EN_ROUTE = 'en_route',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum KYCStatus {
  PENDING = 'pending',
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum VehicleType {
  KEKE = 'keke',
  CAR = 'car',
  BIKE = 'bike',
}

export enum ZoneType {
  PERMITTED = 'permitted',
  RESTRICTED = 'restricted',
  SURGE = 'surge',
}

export enum SubscriptionTier {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

export enum DisputeStatus {
  OPEN = 'open',
  INVESTIGATING = 'investigating',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed',
}

export enum DisputeRaisedBy {
  PASSENGER = 'passenger',
  DRIVER = 'driver',
  ADMIN = 'admin',
}

export enum AdminRole {
  SUPER_ADMIN = 'super_admin',
  ADMIN = 'admin',
  MODERATOR = 'moderator',
}

export enum PaymentMethod {
  CARD = 'card',
  BANK = 'bank',
  USSD = 'ussd',
  CASH = 'cash',
}

export enum PaymentStatus {
  PENDING = 'pending',
  HELD = 'held',
  RELEASED = 'released',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

export enum UserType {
  PASSENGER = 'passenger',
  DRIVER = 'driver',
  ADMIN = 'admin',
}

export enum VerificationTier {
  TIER_0 = 'tier_0',
  TIER_1 = 'tier_1',
  TIER_2 = 'tier_2',
  TIER_3 = 'tier_3',
}

export enum SupportedLanguage {
  ENGLISH = 'en',
  PIDGIN = 'pcm',
  HAUSA = 'ha',
  YORUBA = 'yo',
}

export enum KycDocType {
  NIN = 'nin',
  DRIVERS_LICENCE = 'drivers_licence',
  VEHICLE_REG = 'vehicle_reg',
  ROAD_WORTHINESS = 'road_worthiness',
  INSURANCE = 'insurance',
}

export enum KycRejectionCode {
  DOC_BLURRY = 'DOC_BLURRY',
  DOC_EXPIRED = 'DOC_EXPIRED',
  DOC_MISMATCH = 'DOC_MISMATCH',
  DOC_FRAUDULENT = 'DOC_FRAUDULENT',
  DOC_INCOMPLETE = 'DOC_INCOMPLETE',
}

// ============================================================================
// EMBEDDED / VALUE OBJECTS
// ============================================================================

export interface EmergencyContact {
  name: string;
  phone: string;
  relationship?: string;
}

/** AES-256-GCM encrypted blob as stored in JSONB columns. */
export interface EncryptedField {
  iv: string; // base64
  tag: string; // base64
  ciphertext: string; // base64
}

export interface KycDocumentMeta {
  docType: KycDocType;
  s3Key: string;
  status: KYCStatus;
  rejectionCode?: KycRejectionCode;
  rejectionReason?: string;
  uploadedAt: ISODateString;
  reviewedAt?: ISODateString;
  reviewedBy?: UUID;
  ocrFields?: Record<string, string>; // Textract key-value auto-fill
}

export interface BankDetails {
  accountNumber: string;
  bankCode: string;
  accountName: string;
}

// ============================================================================
// ENTITIES
// ============================================================================

export interface User {
  id: UUID;
  phone: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  fcmToken: string | null;
  preferredLanguage: SupportedLanguage;
  higoPoints: number;
  ratingAvg: number;
  totalTrips: number;
  isVerified: boolean;
  isBlocked: boolean;
  emergencyContacts: EmergencyContact[] | null;
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
  kycDocuments: Record<KycDocType, KycDocumentMeta> | null;
  verificationTier: VerificationTier;

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

  baseFare: Kobo;
  distanceFare: Kobo;
  timeFare: Kobo;
  surgeMultiplier: number;
  totalFare: Kobo;

  paymentMethod: PaymentMethod | null;
  paymentStatus: PaymentStatus;
  paystackReference: string | null;

  passengerRating: number | null;
  driverRating: number | null;

  rideSharePartnerId: UUID | null;
  isShared: boolean;

  startedAt: ISODateString | null;
  completedAt: ISODateString | null;
  cancelledAt: ISODateString | null;
  cancelReason: string | null;
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
  type: string;
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
