CREATE TYPE "DriverApplicationStatus" AS ENUM ('new', 'contacted', 'invited', 'converted', 'rejected');

CREATE TABLE "driver_applications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "full_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "city" TEXT NOT NULL DEFAULT 'Abuja',
    "preferred_language" TEXT NOT NULL DEFAULT 'en',
    "vehicle_type" "VehicleType" NOT NULL DEFAULT 'keke',
    "vehicle_plate" TEXT,
    "vehicle_model" TEXT,
    "has_smartphone" BOOLEAN NOT NULL DEFAULT true,
    "has_nin" BOOLEAN NOT NULL DEFAULT false,
    "has_drivers_licence" BOOLEAN NOT NULL DEFAULT false,
    "status" "DriverApplicationStatus" NOT NULL DEFAULT 'new',
    "source" TEXT NOT NULL DEFAULT 'web',
    "consent_accepted" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "metadata" JSONB,
    "converted_driver_id" UUID,
    "contacted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_applications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "driver_applications_phone_key" ON "driver_applications"("phone");
CREATE INDEX "driver_applications_status_idx" ON "driver_applications"("status");
CREATE INDEX "driver_applications_city_idx" ON "driver_applications"("city");
CREATE INDEX "driver_applications_created_at_idx" ON "driver_applications"("created_at");
