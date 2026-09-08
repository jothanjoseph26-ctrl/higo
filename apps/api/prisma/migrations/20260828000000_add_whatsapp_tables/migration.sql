-- Idempotent WhatsApp tables migration

-- CreateEnum (safe to re-run)
DO $$ BEGIN
  CREATE TYPE "WhatsAppConversationState" AS ENUM ('idle', 'awaiting_passenger_name', 'awaiting_passenger_city', 'awaiting_passenger_referral', 'awaiting_driver_name', 'awaiting_driver_vehicle', 'awaiting_driver_city', 'human_handoff');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "WhatsAppRole" AS ENUM ('passenger', 'driver', 'dispatch', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "whatsapp_config" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "phone_number_id" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "app_secret" TEXT,
    "verify_token" TEXT NOT NULL,
    "business_account_id" TEXT,
    "webhook_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "greeting_message" TEXT,
    "out_of_hours_message" TEXT,
    "human_handoff_threshold" INTEGER NOT NULL DEFAULT 3,
    "max_conversation_age_days" INTEGER NOT NULL DEFAULT 30,
    "last_webhook_received_at" TIMESTAMP(3),
    "total_messages_processed" INTEGER NOT NULL DEFAULT 0,
    "description" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "whatsapp_conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "config_id" UUID NOT NULL,
    "whatsapp_phone" TEXT NOT NULL,
    "whatsapp_name" TEXT,
    "whatsapp_user_id" TEXT,
    "user_id" UUID,
    "driver_id" UUID,
    "role" "WhatsAppRole" NOT NULL DEFAULT 'unknown',
    "preferred_language" TEXT NOT NULL DEFAULT 'en',
    "conversation_state" "WhatsAppConversationState" NOT NULL DEFAULT 'idle',
    "onboarding_data" JSONB,
    "last_intent" TEXT,
    "last_user_message" TEXT,
    "last_bot_message" TEXT,
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "is_human_handoff" BOOLEAN NOT NULL DEFAULT false,
    "handoff_reason" TEXT,
    "handoff_resolved" BOOLEAN NOT NULL DEFAULT false,
    "support_ticket_id" UUID,
    "referral_code" TEXT,
    "referral_campaign" TEXT,
    "last_message_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "failed_ai_attempts" INTEGER NOT NULL DEFAULT 0,
    "last_ai_response_at" TIMESTAMP(3),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" VARCHAR(2000),
    "source" TEXT NOT NULL DEFAULT 'whatsapp',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "whatsapp_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "direction" TEXT NOT NULL,
    "message_type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (IF NOT EXISTS is safe)
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_config_phone_number_id_key" ON "whatsapp_config"("phone_number_id");
CREATE INDEX IF NOT EXISTS "whatsapp_config_is_active_idx" ON "whatsapp_config"("is_active");
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_conversations_config_id_whatsapp_phone_key" ON "whatsapp_conversations"("config_id", "whatsapp_phone");
CREATE INDEX IF NOT EXISTS "whatsapp_conversations_whatsapp_phone_idx" ON "whatsapp_conversations"("whatsapp_phone");
CREATE INDEX IF NOT EXISTS "whatsapp_conversations_user_id_idx" ON "whatsapp_conversations"("user_id");
CREATE INDEX IF NOT EXISTS "whatsapp_conversations_driver_id_idx" ON "whatsapp_conversations"("driver_id");
CREATE INDEX IF NOT EXISTS "whatsapp_conversations_conversation_state_idx" ON "whatsapp_conversations"("conversation_state");
CREATE INDEX IF NOT EXISTS "whatsapp_conversations_is_active_idx" ON "whatsapp_conversations"("is_active");
CREATE INDEX IF NOT EXISTS "whatsapp_conversations_last_message_at_idx" ON "whatsapp_conversations"("last_message_at");
CREATE INDEX IF NOT EXISTS "whatsapp_messages_conversation_id_created_at_idx" ON "whatsapp_messages"("conversation_id", "created_at");
CREATE INDEX IF NOT EXISTS "whatsapp_messages_status_idx" ON "whatsapp_messages"("status");

-- AddForeignKey (conditional — only if not already present)
DO $$ BEGIN
  ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "whatsapp_config"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "whatsapp_conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
