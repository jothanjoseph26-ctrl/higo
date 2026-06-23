-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('requested', 'matched', 'en_route', 'active', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "KYCStatus" AS ENUM ('pending', 'under_review', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('keke', 'car', 'bike');

-- CreateEnum
CREATE TYPE "ZoneType" AS ENUM ('permitted', 'restricted', 'surge');

-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('daily', 'weekly', 'monthly');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('open', 'investigating', 'resolved', 'dismissed');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('super_admin', 'admin', 'moderator');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('card', 'bank', 'ussd', 'cash');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'held', 'released', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('passenger', 'driver', 'admin');

-- CreateEnum
CREATE TYPE "DisputeRaisedBy" AS ENUM ('passenger', 'driver', 'admin');

-- CreateEnum
CREATE TYPE "VerificationTier" AS ENUM ('tier_0', 'tier_1', 'tier_2', 'tier_3');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "avatar_url" TEXT,
    "fcm_token" TEXT,
    "preferred_language" TEXT NOT NULL DEFAULT 'en',
    "higo_points" INTEGER NOT NULL DEFAULT 0,
    "rating_avg" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "total_trips" INTEGER NOT NULL DEFAULT 0,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_blocked" BOOLEAN NOT NULL DEFAULT false,
    "emergency_contacts" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "avatar_url" TEXT,
    "fcm_token" TEXT,
    "vehicle_type" "VehicleType" NOT NULL DEFAULT 'keke',
    "vehicle_plate" TEXT NOT NULL,
    "vehicle_model" TEXT,
    "vehicle_year" INTEGER,
    "vehicle_color" TEXT,
    "kyc_status" "KYCStatus" NOT NULL DEFAULT 'pending',
    "kyc_documents" JSONB,
    "verification_tier" "VerificationTier" NOT NULL DEFAULT 'tier_0',
    "nin_encrypted" JSONB,
    "bank_details_encrypted" JSONB,
    "paystack_recipient_code" TEXT,
    "rating_avg" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "total_trips" INTEGER NOT NULL DEFAULT 0,
    "is_online" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_suspended" BOOLEAN NOT NULL DEFAULT false,
    "subscription_tier" "SubscriptionTier",
    "subscription_expires_at" TIMESTAMP(3),
    "operating_zone_ids" UUID[],
    "current_location" geography(Point,4326),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" UUID NOT NULL,
    "passenger_id" UUID NOT NULL,
    "driver_id" UUID,
    "pickup_location" geography(Point,4326) NOT NULL,
    "pickup_address" TEXT NOT NULL,
    "destination_location" geography(Point,4326) NOT NULL,
    "destination_address" TEXT NOT NULL,
    "route_polyline" TEXT,
    "distance_km" DECIMAL(8,3),
    "duration_min" INTEGER,
    "vehicle_type" "VehicleType" NOT NULL DEFAULT 'keke',
    "status" "TripStatus" NOT NULL DEFAULT 'requested',
    "base_fare" INTEGER NOT NULL DEFAULT 0,
    "distance_fare" INTEGER NOT NULL DEFAULT 0,
    "time_fare" INTEGER NOT NULL DEFAULT 0,
    "surge_multiplier" DECIMAL(4,2) NOT NULL DEFAULT 1.0,
    "total_fare" INTEGER NOT NULL DEFAULT 0,
    "payment_method" "PaymentMethod",
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "paystack_reference" TEXT,
    "passenger_rating" INTEGER,
    "driver_rating" INTEGER,
    "ride_share_partner_id" UUID,
    "is_shared" BOOLEAN NOT NULL DEFAULT false,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_locations" (
    "id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "location" geography(Point,4326) NOT NULL,
    "bearing" DECIMAL(6,2),
    "speed" DECIMAL(6,2),
    "accuracy" DECIMAL(6,2),
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zones" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "zone_type" "ZoneType" NOT NULL,
    "boundary" geography(Polygon,4326) NOT NULL,
    "surge_multiplier" DECIMAL(4,2) NOT NULL DEFAULT 1.0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_config" (
    "id" UUID NOT NULL,
    "vehicle_type" "VehicleType" NOT NULL,
    "base_fare" INTEGER NOT NULL,
    "per_km_fare" INTEGER NOT NULL,
    "per_min_fare" INTEGER NOT NULL,
    "min_fare" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "surge_rules" (
    "id" UUID NOT NULL,
    "zone_id" UUID NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "multiplier" DECIMAL(4,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "surge_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "tier" "SubscriptionTier" NOT NULL,
    "amount" INTEGER NOT NULL,
    "paystack_subscription_code" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "auto_renew" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "raised_by" "DisputeRaisedBy" NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidence_urls" JSONB,
    "status" "DisputeStatus" NOT NULL DEFAULT 'open',
    "resolution" TEXT,
    "resolved_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "user_type" "UserType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'moderator',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_phone_idx" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_is_blocked_idx" ON "users"("is_blocked");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_user_id_key" ON "drivers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_phone_key" ON "drivers"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_email_key" ON "drivers"("email");

-- CreateIndex
CREATE INDEX "drivers_kyc_status_idx" ON "drivers"("kyc_status");

-- CreateIndex
CREATE INDEX "drivers_is_suspended_idx" ON "drivers"("is_suspended");

-- CreateIndex
CREATE INDEX "drivers_subscription_expires_at_idx" ON "drivers"("subscription_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "trips_paystack_reference_key" ON "trips"("paystack_reference");

-- CreateIndex
CREATE INDEX "trips_status_idx" ON "trips"("status");

-- CreateIndex
CREATE INDEX "trips_passenger_id_idx" ON "trips"("passenger_id");

-- CreateIndex
CREATE INDEX "trips_driver_id_idx" ON "trips"("driver_id");

-- CreateIndex
CREATE INDEX "trips_payment_status_idx" ON "trips"("payment_status");

-- CreateIndex
CREATE INDEX "trips_created_at_idx" ON "trips"("created_at");

-- CreateIndex
CREATE INDEX "driver_locations_driver_id_recorded_at_idx" ON "driver_locations"("driver_id", "recorded_at");

-- CreateIndex
CREATE INDEX "zones_zone_type_idx" ON "zones"("zone_type");

-- CreateIndex
CREATE INDEX "zones_is_active_idx" ON "zones"("is_active");

-- CreateIndex
CREATE INDEX "pricing_config_vehicle_type_is_active_idx" ON "pricing_config"("vehicle_type", "is_active");

-- CreateIndex
CREATE INDEX "surge_rules_zone_id_day_of_week_is_active_idx" ON "surge_rules"("zone_id", "day_of_week", "is_active");

-- CreateIndex
CREATE INDEX "subscriptions_driver_id_is_active_idx" ON "subscriptions"("driver_id", "is_active");

-- CreateIndex
CREATE INDEX "subscriptions_expires_at_idx" ON "subscriptions"("expires_at");

-- CreateIndex
CREATE INDEX "disputes_status_idx" ON "disputes"("status");

-- CreateIndex
CREATE INDEX "disputes_trip_id_idx" ON "disputes"("trip_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_idx" ON "notifications"("user_id", "is_read");

-- CreateIndex
CREATE INDEX "notifications_user_type_idx" ON "notifications"("user_type");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE INDEX "admin_users_email_idx" ON "admin_users"("email");

-- CreateIndex
CREATE INDEX "admin_users_role_idx" ON "admin_users"("role");

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_locations" ADD CONSTRAINT "driver_locations_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surge_rules" ADD CONSTRAINT "surge_rules_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
