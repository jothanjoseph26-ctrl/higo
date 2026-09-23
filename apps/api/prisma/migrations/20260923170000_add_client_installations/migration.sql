-- Client-source telemetry: one row per (user, install); no FK (polymorphic role)
CREATE TABLE "client_installations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "role" TEXT NOT NULL,
  "installation_id" VARCHAR(64) NOT NULL,
  "client_type" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "device_platform" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "app_version" VARCHAR(32),
  "build_number" VARCHAR(32),
  "install_source" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "installer_package" VARCHAR(128),
  "integrity_verified" BOOLEAN NOT NULL DEFAULT false,
  "integrity_verified_at" TIMESTAMP(3),
  "integrity_reason" VARCHAR(64),
  "fcm_token" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "client_installations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "client_installations_user_id_installation_id_key"
  ON "client_installations"("user_id", "installation_id");

CREATE INDEX "client_installations_user_id_idx"
  ON "client_installations"("user_id");

CREATE INDEX "client_installations_last_seen_at_idx"
  ON "client_installations"("last_seen_at");
