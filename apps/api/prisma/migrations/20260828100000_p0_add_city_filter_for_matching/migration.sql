-- P0: Add city filter for matching to prevent cross-city driver matching
-- Idempotent: safe to re-run if already partially applied

-- Add city column to trips (skip if exists)
DO $$ BEGIN
  ALTER TABLE "trips" ADD COLUMN "city" TEXT;
EXCEPTION WHEN duplicate_column THEN
  RAISE NOTICE 'trips.city already exists, skipping';
END $$;

-- Add city/state to drivers if missing (may have been added via db push)
DO $$ BEGIN
  ALTER TABLE "drivers" ADD COLUMN "city" TEXT;
EXCEPTION WHEN duplicate_column THEN
  RAISE NOTICE 'drivers.city already exists, skipping';
END $$;

DO $$ BEGIN
  ALTER TABLE "drivers" ADD COLUMN "state" TEXT;
EXCEPTION WHEN duplicate_column THEN
  RAISE NOTICE 'drivers.state already exists, skipping';
END $$;

-- Indexes (IF NOT EXISTS is safe in PostgreSQL 9.5+)
CREATE INDEX IF NOT EXISTS "drivers_city_idx" ON "drivers"("city");
CREATE INDEX IF NOT EXISTS "trips_city_idx" ON "trips"("city");
