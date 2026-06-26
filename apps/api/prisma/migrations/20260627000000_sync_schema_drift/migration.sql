-- Sync Prisma schema fields that were added to schema.prisma without migrations.
-- Fixes auth 500: users.fraud_risk_level (and related drift on drivers/trips).

-- Enums (risk mitigation + HCE)
CREATE TYPE "ReferralStatus" AS ENUM ('pending', 'qualified', 'rewarded');
CREATE TYPE "DriverFeatureName" AS ENUM ('loan', 'insurance', 'fuel_discount', 'spare_parts');
CREATE TYPE "PartnerType" AS ENUM ('union', 'estate', 'fm_company', 'church', 'corporate', 'government');
CREATE TYPE "PartnerStatus" AS ENUM ('prospecting', 'engaged', 'active', 'inactive');
CREATE TYPE "SupportTicketCategory" AS ENUM ('wrong_fare', 'driver_rude', 'passenger_rude', 'lost_item', 'driver_late', 'wrong_location', 'payment_issue', 'other');
CREATE TYPE "SupportTicketStatus" AS ENUM ('open', 'in_progress', 'resolved', 'closed');
CREATE TYPE "FraudEventType" AS ENUM ('gps_spoofing', 'fare_manipulation', 'fake_trip', 'payment_fraud', 'account_sharing', 'refund_abuse', 'device_multiple_accounts', 'other');
CREATE TYPE "FraudSeverity" AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE "FraudEventStatus" AS ENUM ('open', 'investigating', 'resolved');
CREATE TYPE "ActivityStatus" AS ENUM ('dormant', 'occasional', 'active', 'power');
CREATE TYPE "LanguageCode" AS ENUM ('en', 'ha', 'yo', 'ig', 'pcm');
CREATE TYPE "LandmarkType" AS ENUM ('junction', 'building', 'market', 'estate_gate', 'mosque', 'hospital', 'school', 'other');
CREATE TYPE "ComplianceEventType" AS ENUM ('zone_entry', 'zone_exit', 'restricted_zone_violation', 'document_check', 'fine_issued', 'suspension', 'reinstatement', 'other');
CREATE TYPE "NotificationType" AS ENUM ('trip', 'payment', 'kyc', 'promo', 'system', 'broadcast', 'sos', 'subscription', 'fraud_alert');
CREATE TYPE "HceService" AS ENUM ('transcribe', 'translate', 'speak', 'voice_booking', 'landmark', 'assistant', 'intent_extract');

-- Users: fraud risk fields
ALTER TABLE "users" ADD COLUMN "fraud_risk_level" TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE "users" ADD COLUMN "refund_request_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "dispute_rate" DECIMAL(4,2) NOT NULL DEFAULT 0;

CREATE INDEX "users_fraud_risk_level_idx" ON "users"("fraud_risk_level");

-- Drivers: referral, fraud, trust score, activity, financial
ALTER TABLE "drivers" ADD COLUMN "referral_code" TEXT;
ALTER TABLE "drivers" ADD COLUMN "fraud_risk_score" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "drivers" ADD COLUMN "fraud_flags" JSONB DEFAULT '[]';
ALTER TABLE "drivers" ADD COLUMN "device_id" TEXT;
ALTER TABLE "drivers" ADD COLUMN "device_id_locked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "drivers" ADD COLUMN "composite_score" DECIMAL(4,2);
ALTER TABLE "drivers" ADD COLUMN "punctuality_score" DECIMAL(4,2);
ALTER TABLE "drivers" ADD COLUMN "complaint_rate" DECIMAL(4,2);
ALTER TABLE "drivers" ADD COLUMN "acceptance_rate" DECIMAL(4,2);
ALTER TABLE "drivers" ADD COLUMN "completion_rate" DECIMAL(4,2);
ALTER TABLE "drivers" ADD COLUMN "consecutive_rejections" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "drivers" ADD COLUMN "fee_owed" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "drivers" ADD COLUMN "activity_status" TEXT NOT NULL DEFAULT 'dormant';
ALTER TABLE "drivers" ADD COLUMN "last_trip_at" TIMESTAMP(3);
ALTER TABLE "drivers" ADD COLUMN "trips_last_7_days" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "drivers" ADD COLUMN "subscription_loyalty_months" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "drivers_referral_code_key" ON "drivers"("referral_code");
CREATE INDEX "drivers_activity_status_idx" ON "drivers"("activity_status");
CREATE INDEX "drivers_fraud_risk_score_idx" ON "drivers"("fraud_risk_score");

-- Trips: pickup enrichment, cash confirmation, rejection tracking
ALTER TABLE "trips" ADD COLUMN "pickup_landmark" TEXT;
ALTER TABLE "trips" ADD COLUMN "pickup_voice_note_url" VARCHAR(500);
ALTER TABLE "trips" ADD COLUMN "pickup_confirmed_at" TIMESTAMP(3);
ALTER TABLE "trips" ADD COLUMN "pickup_attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "trips" ADD COLUMN "actual_pickup_location" geography(Point,4326);
ALTER TABLE "trips" ADD COLUMN "cash_confirmed_by_driver" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "trips" ADD COLUMN "cash_confirmed_at" TIMESTAMP(3);
ALTER TABLE "trips" ADD COLUMN "rejection_reason" VARCHAR(100);

-- Driver referrals
CREATE TABLE "driver_referrals" (
    "id" UUID NOT NULL,
    "referrer_driver_id" UUID NOT NULL,
    "referred_driver_id" UUID NOT NULL,
    "referral_code" TEXT NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'pending',
    "reward_amount" INTEGER NOT NULL DEFAULT 0,
    "rewarded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_referrals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "driver_referrals_referrer_driver_id_idx" ON "driver_referrals"("referrer_driver_id");
CREATE INDEX "driver_referrals_referred_driver_id_idx" ON "driver_referrals"("referred_driver_id");
CREATE INDEX "driver_referrals_referral_code_idx" ON "driver_referrals"("referral_code");
CREATE INDEX "driver_referrals_status_idx" ON "driver_referrals"("status");

ALTER TABLE "driver_referrals" ADD CONSTRAINT "driver_referrals_referrer_driver_id_fkey" FOREIGN KEY ("referrer_driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "driver_referrals" ADD CONSTRAINT "driver_referrals_referred_driver_id_fkey" FOREIGN KEY ("referred_driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Driver feature interest
CREATE TABLE "driver_feature_interest" (
    "id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "feature_name" "DriverFeatureName" NOT NULL,
    "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_feature_interest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "driver_feature_interest_driver_id_feature_name_key" ON "driver_feature_interest"("driver_id", "feature_name");
CREATE INDEX "driver_feature_interest_driver_id_idx" ON "driver_feature_interest"("driver_id");

ALTER TABLE "driver_feature_interest" ADD CONSTRAINT "driver_feature_interest_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Community partners
CREATE TABLE "community_partners" (
    "id" UUID NOT NULL,
    "partner_type" "PartnerType" NOT NULL,
    "name" TEXT NOT NULL,
    "contact_person" TEXT NOT NULL,
    "contact_phone" TEXT NOT NULL,
    "zone_id" UUID,
    "status" "PartnerStatus" NOT NULL DEFAULT 'prospecting',
    "members_count" INTEGER NOT NULL DEFAULT 0,
    "drivers_referred" INTEGER NOT NULL DEFAULT 0,
    "consumers_referred" INTEGER NOT NULL DEFAULT 0,
    "agreement_signed" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_contact_at" TIMESTAMP(3),

    CONSTRAINT "community_partners_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "community_partners_status_idx" ON "community_partners"("status");
CREATE INDEX "community_partners_partner_type_idx" ON "community_partners"("partner_type");
CREATE INDEX "community_partners_zone_id_idx" ON "community_partners"("zone_id");

ALTER TABLE "community_partners" ADD CONSTRAINT "community_partners_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Support tickets
CREATE TABLE "support_tickets" (
    "id" UUID NOT NULL,
    "trip_id" UUID,
    "raised_by_user_id" UUID NOT NULL,
    "raised_by_type" "UserType" NOT NULL,
    "category" "SupportTicketCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'open',
    "assigned_to_admin_id" UUID,
    "resolution" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "support_tickets_status_idx" ON "support_tickets"("status");
CREATE INDEX "support_tickets_category_idx" ON "support_tickets"("category");
CREATE INDEX "support_tickets_raised_by_user_id_idx" ON "support_tickets"("raised_by_user_id");
CREATE INDEX "support_tickets_trip_id_idx" ON "support_tickets"("trip_id");
CREATE INDEX "support_tickets_assigned_to_admin_id_idx" ON "support_tickets"("assigned_to_admin_id");

ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_raised_by_user_id_fkey" FOREIGN KEY ("raised_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assigned_to_admin_id_fkey" FOREIGN KEY ("assigned_to_admin_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Fraud events
CREATE TABLE "fraud_events" (
    "id" UUID NOT NULL,
    "event_type" "FraudEventType" NOT NULL,
    "driver_id" UUID,
    "passenger_id" UUID,
    "trip_id" UUID,
    "severity" "FraudSeverity" NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "status" "FraudEventStatus" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "fraud_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fraud_events_event_type_idx" ON "fraud_events"("event_type");
CREATE INDEX "fraud_events_severity_idx" ON "fraud_events"("severity");
CREATE INDEX "fraud_events_status_idx" ON "fraud_events"("status");
CREATE INDEX "fraud_events_driver_id_idx" ON "fraud_events"("driver_id");
CREATE INDEX "fraud_events_passenger_id_idx" ON "fraud_events"("passenger_id");
CREATE INDEX "fraud_events_trip_id_idx" ON "fraud_events"("trip_id");
CREATE INDEX "fraud_events_created_at_idx" ON "fraud_events"("created_at");

ALTER TABLE "fraud_events" ADD CONSTRAINT "fraud_events_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fraud_events" ADD CONSTRAINT "fraud_events_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fraud_events" ADD CONSTRAINT "fraud_events_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Fare watch alerts
CREATE TABLE "fare_watch_alerts" (
    "id" UUID NOT NULL,
    "passenger_id" UUID NOT NULL,
    "zone_id" UUID NOT NULL,
    "trip_id" UUID,
    "target_multiplier" DECIMAL(4,2) NOT NULL DEFAULT 1.0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "triggered_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fare_watch_alerts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fare_watch_alerts_passenger_id_idx" ON "fare_watch_alerts"("passenger_id");
CREATE INDEX "fare_watch_alerts_zone_id_idx" ON "fare_watch_alerts"("zone_id");
CREATE INDEX "fare_watch_alerts_trip_id_idx" ON "fare_watch_alerts"("trip_id");
CREATE INDEX "fare_watch_alerts_expires_at_idx" ON "fare_watch_alerts"("expires_at");

ALTER TABLE "fare_watch_alerts" ADD CONSTRAINT "fare_watch_alerts_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fare_watch_alerts" ADD CONSTRAINT "fare_watch_alerts_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fare_watch_alerts" ADD CONSTRAINT "fare_watch_alerts_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Regulatory audit log
CREATE TABLE "regulatory_audit_log" (
    "id" UUID NOT NULL,
    "event_type" "ComplianceEventType" NOT NULL,
    "driver_id" UUID,
    "zone_id" UUID,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "regulatory_audit_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "regulatory_audit_log_event_type_idx" ON "regulatory_audit_log"("event_type");
CREATE INDEX "regulatory_audit_log_driver_id_idx" ON "regulatory_audit_log"("driver_id");
CREATE INDEX "regulatory_audit_log_zone_id_idx" ON "regulatory_audit_log"("zone_id");
CREATE INDEX "regulatory_audit_log_created_at_idx" ON "regulatory_audit_log"("created_at");

ALTER TABLE "regulatory_audit_log" ADD CONSTRAINT "regulatory_audit_log_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "regulatory_audit_log" ADD CONSTRAINT "regulatory_audit_log_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- HCE: user language preferences
CREATE TABLE "user_language_preferences" (
    "user_id" UUID NOT NULL,
    "user_type" "UserType" NOT NULL,
    "language_code" TEXT NOT NULL DEFAULT 'en',
    "voice_gender" TEXT NOT NULL DEFAULT 'male',
    "auto_readout_enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_language_preferences_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "user_language_preferences" ADD CONSTRAINT "user_language_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- HCE: landmark database
CREATE TABLE "landmark_database" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" JSONB NOT NULL,
    "zone" TEXT NOT NULL,
    "lat" DECIMAL(10,7) NOT NULL,
    "lng" DECIMAL(10,7) NOT NULL,
    "landmark_type" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "landmark_database_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "landmark_database_zone_idx" ON "landmark_database"("zone");
CREATE INDEX "landmark_database_verified_idx" ON "landmark_database"("verified");
CREATE INDEX "landmark_database_landmark_type_idx" ON "landmark_database"("landmark_type");

-- HCE: landmark resolutions
CREATE TABLE "landmark_resolutions" (
    "id" UUID NOT NULL,
    "raw_description" TEXT NOT NULL,
    "resolved_landmark_id" UUID,
    "confidence_score" DECIMAL(4,3) NOT NULL,
    "was_correct" BOOLEAN,
    "trip_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "landmark_resolutions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "landmark_resolutions_resolved_landmark_id_idx" ON "landmark_resolutions"("resolved_landmark_id");
CREATE INDEX "landmark_resolutions_trip_id_idx" ON "landmark_resolutions"("trip_id");
CREATE INDEX "landmark_resolutions_created_at_idx" ON "landmark_resolutions"("created_at");

ALTER TABLE "landmark_resolutions" ADD CONSTRAINT "landmark_resolutions_resolved_landmark_id_fkey" FOREIGN KEY ("resolved_landmark_id") REFERENCES "landmark_database"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "landmark_resolutions" ADD CONSTRAINT "landmark_resolutions_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- HCE: usage log
CREATE TABLE "hce_usage_log" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "service_used" TEXT NOT NULL,
    "tokens_consumed" INTEGER NOT NULL DEFAULT 0,
    "cost_usd" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hce_usage_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "hce_usage_log_user_id_idx" ON "hce_usage_log"("user_id");
CREATE INDEX "hce_usage_log_service_used_idx" ON "hce_usage_log"("service_used");
CREATE INDEX "hce_usage_log_created_at_idx" ON "hce_usage_log"("created_at");

ALTER TABLE "hce_usage_log" ADD CONSTRAINT "hce_usage_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- HCE: driver vocabulary
CREATE TABLE "driver_vocabulary" (
    "id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "term" TEXT NOT NULL,
    "resolved_lat" DECIMAL(10,7) NOT NULL,
    "resolved_lng" DECIMAL(10,7) NOT NULL,
    "usage_count" INTEGER NOT NULL DEFAULT 1,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_vocabulary_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "driver_vocabulary_driver_id_term_key" ON "driver_vocabulary"("driver_id", "term");
CREATE INDEX "driver_vocabulary_driver_id_idx" ON "driver_vocabulary"("driver_id");

ALTER TABLE "driver_vocabulary" ADD CONSTRAINT "driver_vocabulary_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;