-- Base44 migration Track 02: new entity modules without Wallet/config-table duplication.

CREATE TYPE "DeliveryStatus" AS ENUM ('requested', 'accepted', 'picked_up', 'en_route', 'delivered', 'cancelled');
CREATE TYPE "ParcelSize" AS ENUM ('small', 'medium', 'large');
CREATE TYPE "LoyaltyTier" AS ENUM ('bronze', 'silver', 'gold', 'platinum');
CREATE TYPE "ReferralSourceType" AS ENUM ('driver', 'staff');
CREATE TYPE "Base44ReferralStatus" AS ENUM ('pending', 'completed', 'expired');
CREATE TYPE "ReferralCashoutStatus" AS ENUM ('pending', 'available', 'requested', 'paid');
CREATE TYPE "WaitingListStatus" AS ENUM ('pending', 'notified', 'activated');
CREATE TYPE "CityStatus" AS ENUM ('active', 'inactive');
CREATE TYPE "FareProfileDataStatus" AS ENUM ('confirmed', 'needs_verification');
CREATE TYPE "AIAvailability" AS ENUM ('available', 'unavailable', 'unknown');
CREATE TYPE "AIFreeStatus" AS ENUM ('free', 'paid', 'unknown');
CREATE TYPE "OfflineActionStatus" AS ENUM ('queued', 'processed', 'failed', 'expired', 'blocked');

CREATE TABLE "deliveries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "sender_id" UUID NOT NULL,
  "sender_name" TEXT,
  "sender_phone" TEXT,
  "city" TEXT NOT NULL DEFAULT 'Abuja',
  "pickup_location" geography(Point,4326) NOT NULL,
  "pickup_address" TEXT NOT NULL,
  "dropoff_location" geography(Point,4326) NOT NULL,
  "dropoff_address" TEXT NOT NULL,
  "recipient_name" TEXT NOT NULL,
  "recipient_phone" TEXT NOT NULL,
  "parcel_size" "ParcelSize" NOT NULL DEFAULT 'small',
  "parcel_description" TEXT,
  "parcel_photo_url" TEXT,
  "vehicle_type" "VehicleType" NOT NULL DEFAULT 'bike',
  "status" "DeliveryStatus" NOT NULL DEFAULT 'requested',
  "rider_id" UUID,
  "estimated_fare" INTEGER NOT NULL DEFAULT 0,
  "total_fare" INTEGER NOT NULL DEFAULT 0,
  "distance_km" DECIMAL(8,3),
  "duration_min" INTEGER,
  "payment_method" "PaymentMethod" NOT NULL DEFAULT 'cash',
  "payment_status" "PaymentStatus" NOT NULL DEFAULT 'pending',
  "delivery_photo_url" TEXT,
  "recipient_verified" BOOLEAN NOT NULL DEFAULT false,
  "tracking_location" geography(Point,4326),
  "accepted_at" TIMESTAMP(3),
  "picked_up_at" TIMESTAMP(3),
  "delivered_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "cancel_reason" TEXT,
  "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "deliveries"
  ADD CONSTRAINT "deliveries_sender_id_fkey"
  FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "deliveries"
  ADD CONSTRAINT "deliveries_rider_id_fkey"
  FOREIGN KEY ("rider_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "deliveries_status_idx" ON "deliveries"("status");
CREATE INDEX "deliveries_sender_id_idx" ON "deliveries"("sender_id");
CREATE INDEX "deliveries_rider_id_idx" ON "deliveries"("rider_id");
CREATE INDEX "deliveries_created_at_idx" ON "deliveries"("created_at");
CREATE INDEX "deliveries_city_idx" ON "deliveries"("city");
CREATE INDEX "deliveries_pickup_location_gist_idx" ON "deliveries" USING GIST ("pickup_location");
CREATE INDEX "deliveries_dropoff_location_gist_idx" ON "deliveries" USING GIST ("dropoff_location");

CREATE TABLE "loyalty_accounts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "points" INTEGER NOT NULL DEFAULT 0,
  "tier" "LoyaltyTier" NOT NULL DEFAULT 'bronze',
  "total_earned" INTEGER NOT NULL DEFAULT 0,
  "total_redeemed" INTEGER NOT NULL DEFAULT 0,
  "referral_code" TEXT,
  "trips_completed" INTEGER NOT NULL DEFAULT 0,
  "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "loyalty_accounts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "loyalty_accounts"
  ADD CONSTRAINT "loyalty_accounts_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "loyalty_accounts_user_id_key" ON "loyalty_accounts"("user_id");
CREATE UNIQUE INDEX "loyalty_accounts_referral_code_key" ON "loyalty_accounts"("referral_code");
CREATE INDEX "loyalty_accounts_tier_idx" ON "loyalty_accounts"("tier");

CREATE TABLE "referrals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "referrer_id" UUID NOT NULL,
  "referrer_name" TEXT,
  "referrer_type" "ReferralSourceType" NOT NULL DEFAULT 'driver',
  "code" TEXT NOT NULL,
  "referred_email" TEXT,
  "referred_user_id" UUID,
  "referred_driver_id" UUID,
  "referrer_reward" INTEGER NOT NULL DEFAULT 50000,
  "referred_reward" INTEGER NOT NULL DEFAULT 50000,
  "commission_pct" DECIMAL(5,2),
  "subscription_amount" INTEGER,
  "subscription_plan" "SubscriptionTier",
  "commission_amount" INTEGER,
  "status" "Base44ReferralStatus" NOT NULL DEFAULT 'pending',
  "triggered_at" TIMESTAMP(3),
  "cashout_status" "ReferralCashoutStatus" NOT NULL DEFAULT 'pending',
  "cashout_requested_at" TIMESTAMP(3),
  "cashout_paid_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "referrals"
  ADD CONSTRAINT "referrals_referred_user_id_fkey"
  FOREIGN KEY ("referred_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "referrals"
  ADD CONSTRAINT "referrals_referred_driver_id_fkey"
  FOREIGN KEY ("referred_driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "referrals_referrer_id_idx" ON "referrals"("referrer_id");
CREATE INDEX "referrals_referred_user_id_idx" ON "referrals"("referred_user_id");
CREATE INDEX "referrals_referred_driver_id_idx" ON "referrals"("referred_driver_id");
CREATE INDEX "referrals_code_idx" ON "referrals"("code");
CREATE INDEX "referrals_status_idx" ON "referrals"("status");
CREATE INDEX "referrals_cashout_status_idx" ON "referrals"("cashout_status");

CREATE TABLE "waiting_list" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "city_requested" TEXT,
  "lat" DECIMAL(10,7),
  "lng" DECIMAL(10,7),
  "status" "WaitingListStatus" NOT NULL DEFAULT 'pending',
  "user_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "waiting_list_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "waiting_list"
  ADD CONSTRAINT "waiting_list_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "waiting_list_email_idx" ON "waiting_list"("email");
CREATE INDEX "waiting_list_status_idx" ON "waiting_list"("status");
CREATE INDEX "waiting_list_city_requested_idx" ON "waiting_list"("city_requested");
CREATE INDEX "waiting_list_created_at_idx" ON "waiting_list"("created_at");

CREATE TABLE "subscription_coupons" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" TEXT NOT NULL,
  "description" TEXT,
  "plan" "SubscriptionTier" NOT NULL DEFAULT 'monthly',
  "duration_days" INTEGER NOT NULL DEFAULT 30,
  "max_uses" INTEGER NOT NULL DEFAULT 0,
  "used_count" INTEGER NOT NULL DEFAULT 0,
  "max_uses_per_user" INTEGER NOT NULL DEFAULT 1,
  "valid_from" TIMESTAMP(3),
  "valid_until" TIMESTAMP(3),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscription_coupons_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscription_coupons_code_key" ON "subscription_coupons"("code");
CREATE INDEX "subscription_coupons_is_active_idx" ON "subscription_coupons"("is_active");
CREATE INDEX "subscription_coupons_plan_idx" ON "subscription_coupons"("plan");

CREATE TABLE "subscription_coupon_redemptions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "coupon_id" UUID NOT NULL,
  "driver_id" UUID NOT NULL,
  "user_id" UUID,
  "redeemed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscription_coupon_redemptions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "subscription_coupon_redemptions"
  ADD CONSTRAINT "subscription_coupon_redemptions_coupon_id_fkey"
  FOREIGN KEY ("coupon_id") REFERENCES "subscription_coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_coupon_redemptions"
  ADD CONSTRAINT "subscription_coupon_redemptions_driver_id_fkey"
  FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_coupon_redemptions"
  ADD CONSTRAINT "subscription_coupon_redemptions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "subscription_coupon_redemptions_coupon_id_idx" ON "subscription_coupon_redemptions"("coupon_id");
CREATE INDEX "subscription_coupon_redemptions_driver_id_idx" ON "subscription_coupon_redemptions"("driver_id");
CREATE INDEX "subscription_coupon_redemptions_user_id_idx" ON "subscription_coupon_redemptions"("user_id");

CREATE TABLE "cities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "country" TEXT NOT NULL DEFAULT 'Nigeria',
  "status" "CityStatus" NOT NULL DEFAULT 'active',
  "currency" TEXT NOT NULL DEFAULT 'NGN',
  "timezone" TEXT NOT NULL DEFAULT 'Africa/Lagos',
  "default_language" TEXT NOT NULL DEFAULT 'en',
  "launch_date" TIMESTAMP(3),
  "center_latitude" DECIMAL(10,7) NOT NULL,
  "center_longitude" DECIMAL(10,7) NOT NULL,
  "default_zoom" INTEGER NOT NULL DEFAULT 13,
  "service_radius_km" DECIMAL(6,2) NOT NULL DEFAULT 15,
  "logo_url" TEXT,
  "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cities_name_state_country_key" ON "cities"("name", "state", "country");
CREATE INDEX "cities_status_idx" ON "cities"("status");

CREATE TABLE "mobility_corridors" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "city" TEXT NOT NULL DEFAULT 'Abuja',
  "corridor_code" TEXT,
  "start_area" TEXT,
  "end_area" TEXT,
  "connected_zones" JSONB NOT NULL DEFAULT '[]',
  "allowed_roads" JSONB NOT NULL DEFAULT '[]',
  "restricted_roads" JSONB NOT NULL DEFAULT '[]',
  "transfer_points" JSONB NOT NULL DEFAULT '[]',
  "keke_parks" JSONB NOT NULL DEFAULT '[]',
  "operating_hours" JSONB,
  "night_restricted" BOOLEAN NOT NULL DEFAULT false,
  "is_expressway_route" BOOLEAN NOT NULL DEFAULT false,
  "center_lat" DECIMAL(10,7),
  "center_lng" DECIMAL(10,7),
  "avg_fare_min" INTEGER,
  "avg_fare_max" INTEGER,
  "avg_trip_duration_min" INTEGER,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mobility_corridors_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mobility_corridors_city_idx" ON "mobility_corridors"("city");
CREATE INDEX "mobility_corridors_is_active_idx" ON "mobility_corridors"("is_active");
CREATE INDEX "mobility_corridors_priority_idx" ON "mobility_corridors"("priority");

CREATE TABLE "inspection_centers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "lat" DECIMAL(10,7),
  "lng" DECIMAL(10,7),
  "phone" TEXT,
  "email" TEXT,
  "manager_name" TEXT,
  "operating_hours" JSONB,
  "capacity_per_day" INTEGER NOT NULL DEFAULT 50,
  "vehicle_types_supported" JSONB NOT NULL DEFAULT '[]',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "city" TEXT NOT NULL DEFAULT 'Abuja',
  "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inspection_centers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "inspection_centers_city_idx" ON "inspection_centers"("city");
CREATE INDEX "inspection_centers_is_active_idx" ON "inspection_centers"("is_active");

CREATE TABLE "fare_profiles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "origin" TEXT NOT NULL,
  "destination" TEXT NOT NULL,
  "city" TEXT NOT NULL DEFAULT 'Abuja',
  "origin_lat" DECIMAL(10,7),
  "origin_lng" DECIMAL(10,7),
  "destination_lat" DECIMAL(10,7),
  "destination_lng" DECIMAL(10,7),
  "corridor_cluster" TEXT,
  "distance_km_est" DECIMAL(8,3),
  "shared_fare_low_ngn" INTEGER,
  "shared_fare_high_ngn" INTEGER,
  "shared_fare_mid_ngn" INTEGER,
  "typical_occupancy" INTEGER NOT NULL DEFAULT 4,
  "driver_gross_shared_ngn" INTEGER,
  "realization_factor" DECIMAL(4,2) NOT NULL DEFAULT 0.85,
  "suggested_exclusive_fare_ngn" INTEGER,
  "demand_level" TEXT,
  "peak_hours" TEXT,
  "data_status" "FareProfileDataStatus" NOT NULL DEFAULT 'needs_verification',
  "source" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fare_profiles_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fare_profiles_city_idx" ON "fare_profiles"("city");
CREATE INDEX "fare_profiles_origin_destination_idx" ON "fare_profiles"("origin", "destination");
CREATE INDEX "fare_profiles_is_active_idx" ON "fare_profiles"("is_active");
CREATE INDEX "fare_profiles_data_status_idx" ON "fare_profiles"("data_status");
