-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('trip', 'support');

-- CreateEnum
CREATE TYPE "MessageSenderType" AS ENUM ('passenger', 'driver', 'admin');

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "trip_id" UUID,
    "passenger_id" UUID NOT NULL,
    "driver_id" UUID,
    "type" "ConversationType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "sender_type" "MessageSenderType" NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conversations_trip_id_key" ON "conversations"("trip_id");

-- CreateIndex
CREATE INDEX "conversations_passenger_id_type_idx" ON "conversations"("passenger_id", "type");

-- CreateIndex
CREATE INDEX "conversations_driver_id_idx" ON "conversations"("driver_id");

-- CreateIndex
CREATE INDEX "conversations_type_idx" ON "conversations"("type");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_passenger_id_fkey" FOREIGN KEY ("passenger_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One support thread per passenger (partial unique index)
CREATE UNIQUE INDEX "conversations_passenger_support_unique" ON "conversations"("passenger_id") WHERE "type" = 'support';