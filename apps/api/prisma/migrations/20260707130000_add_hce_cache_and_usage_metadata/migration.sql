ALTER TABLE "hce_usage_log"
  ADD COLUMN IF NOT EXISTS "provider" TEXT,
  ADD COLUMN IF NOT EXISTS "model" TEXT,
  ADD COLUMN IF NOT EXISTS "cache_hit" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "fallback_used" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "success" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "hce_cache" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "cache_key" TEXT NOT NULL,
  "service" TEXT NOT NULL,
  "source_language" TEXT,
  "target_language" TEXT,
  "input_hash" TEXT NOT NULL,
  "input_text" TEXT NOT NULL,
  "output" JSONB NOT NULL,
  "provider" TEXT,
  "model" TEXT,
  "hit_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "hce_cache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "hce_cache_cache_key_key" ON "hce_cache"("cache_key");
CREATE INDEX IF NOT EXISTS "hce_cache_service_idx" ON "hce_cache"("service");
CREATE INDEX IF NOT EXISTS "hce_cache_source_language_target_language_idx" ON "hce_cache"("source_language", "target_language");
CREATE INDEX IF NOT EXISTS "hce_cache_updated_at_idx" ON "hce_cache"("updated_at");
