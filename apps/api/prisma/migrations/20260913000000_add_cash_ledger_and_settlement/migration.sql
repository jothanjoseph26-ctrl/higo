-- P0: Cash Ledger & Settlement Control
-- Migration: add_cash_ledger_and_settlement

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('fare_collection', 'cash_collected', 'commission_earned', 'commission_paid', 'driver_payout', 'refund', 'subscription_fee');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('not_applicable', 'outstanding', 'partially_settled', 'settled', 'overdue');

-- CreateEnum
CREATE TYPE "CashSettlementMethod" AS ENUM ('bank_transfer', 'paystack', 'in_person');

-- CreateEnum
CREATE TYPE "CashSettlementStatus" AS ENUM ('pending', 'confirmed', 'failed');

-- AlterTable: Add settlement fields to trips
ALTER TABLE "trips" ADD COLUMN "settlement_status" "SettlementStatus" NOT NULL DEFAULT 'not_applicable';
ALTER TABLE "trips" ADD COLUMN "driver_commission_owed" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: Add cash ledger fields to drivers
ALTER TABLE "drivers" ADD COLUMN "cash_commission_owed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "drivers" ADD COLUMN "settlement_threshold" INTEGER NOT NULL DEFAULT 500000;

-- CreateIndex: Settlement status index on trips
CREATE INDEX "idx_trips_settlement_status" ON "trips"("settlement_status");

-- CreateTable: DriverLedger
CREATE TABLE "driver_ledger" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "driver_id" UUID NOT NULL,
    "trip_id" UUID,
    "entry_type" "LedgerEntryType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CashSettlement
CREATE TABLE "cash_settlements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "driver_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" "CashSettlementMethod" NOT NULL,
    "status" "CashSettlementStatus" NOT NULL DEFAULT 'pending',
    "reference" TEXT,
    "confirmed_by" UUID,
    "confirmed_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Ledger indexes
CREATE INDEX "idx_driver_ledger_driver_id" ON "driver_ledger"("driver_id");
CREATE INDEX "idx_driver_ledger_trip_id" ON "driver_ledger"("trip_id");
CREATE INDEX "idx_driver_ledger_entry_type" ON "driver_ledger"("entry_type");
CREATE INDEX "idx_driver_ledger_created_at" ON "driver_ledger"("created_at");

-- CreateIndex: Settlement indexes
CREATE INDEX "idx_cash_settlements_driver_id" ON "cash_settlements"("driver_id");
CREATE INDEX "idx_cash_settlements_status" ON "cash_settlements"("status");
CREATE INDEX "idx_cash_settlements_created_at" ON "cash_settlements"("created_at");

-- CreateIndex: Unique reference for settlements
CREATE UNIQUE INDEX "cash_settlements_reference_key" ON "cash_settlements"("reference");

-- AddForeignKey: DriverLedger -> Driver
ALTER TABLE "driver_ledger" ADD CONSTRAINT "driver_ledger_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: DriverLedger -> Trip
ALTER TABLE "driver_ledger" ADD CONSTRAINT "driver_ledger_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: CashSettlement -> Driver
ALTER TABLE "cash_settlements" ADD CONSTRAINT "cash_settlements_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
