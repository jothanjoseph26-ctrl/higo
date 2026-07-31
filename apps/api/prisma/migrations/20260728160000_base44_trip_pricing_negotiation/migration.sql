-- Base44 migration Track 01: Trip/Ride pricing metadata and fare negotiation.

CREATE TYPE "RideMode" AS ENUM ('instant', 'negotiate', 'share', 'schedule_flex', 'schedule_exact');
CREATE TYPE "FareNegotiationStatus" AS ENUM ('active', 'accepted', 'rejected', 'expired', 'cancelled');

ALTER TYPE "TripStatus" ADD VALUE IF NOT EXISTS 'arrived';

ALTER TABLE "pricing_config"
  ADD COLUMN "city" TEXT,
  ADD COLUMN "rounding_increment" INTEGER NOT NULL DEFAULT 5000,
  ADD COLUMN "customer_booking_fee" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "customer_statutory_levy" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "price_is_all_in" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "instant_multiplier" DECIMAL(5,2) NOT NULL DEFAULT 1.0,
  ADD COLUMN "negotiate_recommended_multiplier" DECIMAL(5,2) NOT NULL DEFAULT 1.0,
  ADD COLUMN "negotiate_minimum_offer_multiplier" DECIMAL(5,2) NOT NULL DEFAULT 0.9,
  ADD COLUMN "negotiate_fast_match_multiplier" DECIMAL(5,2) NOT NULL DEFAULT 1.1,
  ADD COLUMN "share_passenger_multiplier" DECIMAL(5,2) NOT NULL DEFAULT 0.66,
  ADD COLUMN "share_minimum_matched_passengers" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "share_requires_confirmed_match" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "share_maximum_detour_minutes" INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN "schedule_flexible_multiplier" DECIMAL(5,2) NOT NULL DEFAULT 0.9,
  ADD COLUMN "schedule_exact_time_multiplier" DECIMAL(5,2) NOT NULL DEFAULT 1.05,
  ADD COLUMN "surge_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "surge_maximum_multiplier" DECIMAL(4,2) NOT NULL DEFAULT 1.2,
  ADD COLUMN "pricing_version" TEXT NOT NULL DEFAULT 'v2.0';

CREATE TABLE "fare_negotiations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "passenger_id" UUID NOT NULL,
  "passenger_name" TEXT,
  "selected_driver_id" UUID,
  "selected_driver_name" TEXT,
  "pickup_address" TEXT NOT NULL,
  "pickup_lat" DECIMAL(10,7) NOT NULL,
  "pickup_lng" DECIMAL(10,7) NOT NULL,
  "destination_address" TEXT NOT NULL,
  "destination_lat" DECIMAL(10,7) NOT NULL,
  "destination_lng" DECIMAL(10,7) NOT NULL,
  "vehicle_type" "VehicleType" NOT NULL DEFAULT 'keke',
  "estimated_fare" INTEGER NOT NULL,
  "passenger_offer" INTEGER NOT NULL,
  "final_fare" INTEGER,
  "distance_km" DECIMAL(8,3),
  "duration_min" INTEGER,
  "current_round" INTEGER NOT NULL DEFAULT 1,
  "max_rounds" INTEGER NOT NULL DEFAULT 3,
  "status" "FareNegotiationStatus" NOT NULL DEFAULT 'active',
  "driver_responses" JSONB NOT NULL DEFAULT '[]',
  "closed_reason" TEXT,
  "negotiation_duration_sec" INTEGER,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fare_negotiations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "fare_negotiations"
  ADD CONSTRAINT "fare_negotiations_passenger_id_fkey"
  FOREIGN KEY ("passenger_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fare_negotiations"
  ADD CONSTRAINT "fare_negotiations_selected_driver_id_fkey"
  FOREIGN KEY ("selected_driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "fare_negotiations_passenger_id_status_idx" ON "fare_negotiations"("passenger_id", "status");
CREATE INDEX "fare_negotiations_selected_driver_id_idx" ON "fare_negotiations"("selected_driver_id");
CREATE INDEX "fare_negotiations_status_expires_at_idx" ON "fare_negotiations"("status", "expires_at");

ALTER TABLE "trips"
  ADD COLUMN "raw_fare" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "quoted_fare" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "minimum_fare" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "minimum_fare_applied" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "mode_multiplier" DECIMAL(5,2) NOT NULL DEFAULT 1.0,
  ADD COLUMN "pricing_version" TEXT NOT NULL DEFAULT 'v2.0',
  ADD COLUMN "customer_booking_fee" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "customer_statutory_levy" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "promo_code" TEXT,
  ADD COLUMN "discount_amount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "ride_mode" "RideMode" NOT NULL DEFAULT 'instant',
  ADD COLUMN "negotiation_id" UUID,
  ADD COLUMN "scheduled_for" TIMESTAMP(3),
  ADD COLUMN "is_scheduled" BOOLEAN NOT NULL DEFAULT false;

UPDATE "trips"
SET "raw_fare" = "base_fare" + "distance_fare" + "time_fare",
    "quoted_fare" = "total_fare",
    "minimum_fare" = "total_fare",
    "minimum_fare_applied" = false
WHERE "raw_fare" = 0;

ALTER TABLE "trips"
  ADD CONSTRAINT "trips_negotiation_id_fkey"
  FOREIGN KEY ("negotiation_id") REFERENCES "fare_negotiations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "trips_ride_mode_idx" ON "trips"("ride_mode");
CREATE INDEX "trips_negotiation_id_idx" ON "trips"("negotiation_id");
