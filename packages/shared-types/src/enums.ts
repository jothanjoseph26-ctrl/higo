/**
 * HiGo Abuja — All Enum Definitions
 * Package: @higo/shared-types
 *
 * Single source of truth for every enum used across the platform.
 * Mirrors schema.prisma enums 1:1, plus additional application-level enums
 * from risk mitigation and HCE modules.
 *
 * RULE: Additive-only. Never remove or reorder values without a coordinated
 * version bump across all consumers.
 */

// ============================================================================
// PRISMA-SCHEMA ENUMS (1:1 with schema.prisma)
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

/** Driver KYC document types required for onboarding. */
export enum KycDocType {
  NIN = 'nin',
  DRIVERS_LICENCE = 'drivers_licence',
  VEHICLE_REG = 'vehicle_reg',
  ROAD_WORTHINESS = 'road_worthiness',
  INSURANCE = 'insurance',
}

/** Standardised admin rejection codes for KYC documents. */
export enum KycRejectionCode {
  DOC_BLURRY = 'doc_blurry',
  DOC_EXPIRED = 'doc_expired',
  DOC_MISMATCH = 'doc_mismatch',
  DOC_FRAUDULENT = 'doc_fraudulent',
  DOC_INCOMPLETE = 'doc_incomplete',
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

export enum DisputeRaisedBy {
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

export enum PromoDiscountType {
  PERCENT = 'percent',
  FIXED = 'fixed',
}

export enum ConversationType {
  TRIP = 'trip',
  SUPPORT = 'support',
}

export enum MessageSenderType {
  PASSENGER = 'passenger',
  DRIVER = 'driver',
  ADMIN = 'admin',
}

// ============================================================================
// APPLICATION ENUMS (risk mitigation, HCE, operations)
// ============================================================================

/** Driver referral status. */
export enum ReferralStatus {
  PENDING = 'pending',
  QUALIFIED = 'qualified',
  REWARDED = 'rewarded',
}

/** HiGo Plus feature interest registry (Risk 17). */
export enum DriverFeatureName {
  LOAN = 'loan',
  INSURANCE = 'insurance',
  FUEL_DISCOUNT = 'fuel_discount',
  SPARE_PARTS = 'spare_parts',
}

/** Community / union partner type (Risk 19). */
export enum PartnerType {
  UNION = 'union',
  ESTATE = 'estate',
  FUEL_COMPANY = 'fm_company',
  CHURCH = 'church',
  CORPORATE = 'corporate',
  GOVERNMENT = 'government',
}

/** Community partner engagement status. */
export enum PartnerStatus {
  PROSPECTING = 'prospecting',
  ENGAGED = 'engaged',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

/** Support ticket category (Risk 7). */
export enum SupportTicketCategory {
  WRONG_FARE = 'wrong_fare',
  DRIVER_RUDE = 'driver_rude',
  PASSENGER_RUDE = 'passenger_rude',
  LOST_ITEM = 'lost_item',
  DRIVER_LATE = 'driver_late',
  WRONG_LOCATION = 'wrong_location',
  PAYMENT_ISSUE = 'payment_issue',
  OTHER = 'other',
}

/** Support ticket status. */
export enum SupportTicketStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
}

/** Fraud event type (Risk 13). */
export enum FraudEventType {
  GPS_SPOOFING = 'gps_spoofing',
  FARE_MANIPULATION = 'fare_manipulation',
  FAKE_TRIP = 'fake_trip',
  PAYMENT_FRAUD = 'payment_fraud',
  ACCOUNT_SHARING = 'account_sharing',
  REFUND_ABUSE = 'refund_abuse',
  DEVICE_MULTIPLE_ACCOUNTS = 'device_multiple_accounts',
  OTHER = 'other',
}

/** Fraud event severity. */
export enum FraudSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/** Fraud event resolution status. */
export enum FraudEventStatus {
  OPEN = 'open',
  INVESTIGATING = 'investigating',
  RESOLVED = 'resolved',
}

/** Driver activity status (recalculated nightly). */
export enum ActivityStatus {
  DORMANT = 'dormant',
  OCCASIONAL = 'occasional',
  ACTIVE = 'active',
  POWER = 'power',
}

/** HCE language codes. */
export enum LanguageCode {
  EN = 'en',
  HA = 'ha',
  YO = 'yo',
  IG = 'ig',
  PCM = 'pcm',
}

/** Landmark type for the Abuja landmark database. */
export enum LandmarkType {
  JUNCTION = 'junction',
  BUILDING = 'building',
  MARKET = 'market',
  ESTATE_GATE = 'estate_gate',
  MOSQUE = 'mosque',
  HOSPITAL = 'hospital',
  SCHOOL = 'school',
  OTHER = 'other',
}

/** Regulatory compliance audit event types (Risk 11). */
export enum ComplianceEventType {
  ZONE_ENTRY = 'zone_entry',
  ZONE_EXIT = 'zone_exit',
  RESTRICTED_ZONE_VIOLATION = 'restricted_zone_violation',
  DOCUMENT_CHECK = 'document_check',
  FINE_ISSUED = 'fine_issued',
  SUSPENSION = 'suspension',
  REINSTATEMENT = 'reinstatement',
  OTHER = 'other',
}

/** Notification type taxonomy. */
export enum NotificationType {
  TRIP = 'trip',
  PAYMENT = 'payment',
  KYC = 'kyc',
  PROMO = 'promo',
  SYSTEM = 'system',
  BROADCAST = 'broadcast',
  SOS = 'sos',
  SUBSCRIPTION = 'subscription',
  FRAUD_ALERT = 'fraud_alert',
}

/** HCE service identifier for usage logging. */
export enum HceService {
  TRANSCRIBE = 'transcribe',
  TRANSLATE = 'translate',
  SPEAK = 'speak',
  VOICE_BOOKING = 'voice_booking',
  LANDMARK = 'landmark',
  ASSISTANT = 'assistant',
  INTENT_EXTRACT = 'intent_extract',
}
