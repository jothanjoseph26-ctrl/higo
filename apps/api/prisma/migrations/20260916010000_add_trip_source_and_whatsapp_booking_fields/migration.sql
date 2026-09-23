DO $$
BEGIN
  CREATE TYPE "TripSource" AS ENUM ('mobile_app', 'whatsapp', 'web', 'admin');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
DECLARE
  src_type TEXT;
BEGIN
  SELECT data_type INTO src_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'trips' AND column_name = 'source';

  IF src_type IS NULL THEN
    ALTER TABLE "trips" ADD COLUMN "source" "TripSource" NOT NULL DEFAULT 'mobile_app';
  ELSIF src_type IN ('text', 'character varying') THEN
    ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "source_tmp" "TripSource" NOT NULL DEFAULT 'mobile_app';
    UPDATE "trips"
    SET "source_tmp" = CASE
      WHEN "source" IN ('mobile_app', 'whatsapp', 'web', 'admin') THEN "source"::"TripSource"
      WHEN "source" = 'mobile' THEN 'mobile_app'::"TripSource"
      ELSE 'mobile_app'::"TripSource"
    END
    WHERE "source_tmp" IS DISTINCT FROM CASE
      WHEN "source" IN ('mobile_app', 'whatsapp', 'web', 'admin') THEN "source"::"TripSource"
      WHEN "source" = 'mobile' THEN 'mobile_app'::"TripSource"
      ELSE 'mobile_app'::"TripSource"
    END;
    ALTER TABLE "trips" DROP COLUMN "source";
    ALTER TABLE "trips" RENAME COLUMN "source_tmp" TO "source";
  END IF;
END $$;

ALTER TABLE "whatsapp_conversations"
  ADD COLUMN IF NOT EXISTS "active_trip_id" UUID,
  ADD COLUMN IF NOT EXISTS "active_booking" JSONB,
  ADD COLUMN IF NOT EXISTS "session_expires_at" TIMESTAMP(3);
