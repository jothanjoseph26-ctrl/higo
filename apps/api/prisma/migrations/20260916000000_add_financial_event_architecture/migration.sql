-- ============================================================================
-- PHASE 1C: Additive Financial Event Architecture (Corrected)
-- Date: 2026-09-16
-- ============================================================================

-- 1. Add new canonical enum values (legacy values stay as-is in DB)
ALTER TYPE "LedgerEntryType" ADD VALUE 'TRIP_EARNING';
ALTER TYPE "LedgerEntryType" ADD VALUE 'BONUS';
ALTER TYPE "LedgerEntryType" ADD VALUE 'ADJUSTMENT_CREDIT';
ALTER TYPE "LedgerEntryType" ADD VALUE 'PLATFORM_COMMISSION';
ALTER TYPE "LedgerEntryType" ADD VALUE 'SUBSCRIPTION_CHARGE';
ALTER TYPE "LedgerEntryType" ADD VALUE 'SUBSCRIPTION_PAYMENT';
ALTER TYPE "LedgerEntryType" ADD VALUE 'PENALTY';
ALTER TYPE "LedgerEntryType" ADD VALUE 'ADJUSTMENT_DEBIT';
ALTER TYPE "LedgerEntryType" ADD VALUE 'COMMISSION_PAYMENT';
ALTER TYPE "LedgerEntryType" ADD VALUE 'DRIVER_PAYOUT';
ALTER TYPE "LedgerEntryType" ADD VALUE 'REFUND';
ALTER TYPE "LedgerEntryType" ADD VALUE 'REVERSAL';
ALTER TYPE "LedgerEntryType" ADD VALUE 'CASH_COLLECTION';

-- 2. Create FinancialEventType enum
CREATE TYPE "FinancialEventType" AS ENUM (
  'TRIP_COMPLETED',
  'COMMISSION_SETTLED',
  'SUBSCRIPTION_CHARGED',
  'SUBSCRIPTION_PAID',
  'BONUS_GRANTED',
  'PENALTY_APPLIED',
  'ADJUSTMENT_CREDITED',
  'ADJUSTMENT_DEBITED',
  'REFUND_ISSUED',
  'ENTRY_REVERSED'
);

-- 3. Create BalanceType enum
CREATE TYPE "BalanceType" AS ENUM (
  'EARNINGS',
  'LIABILITY',
  'SETTLEMENT',
  'METRIC'
);

-- 4. Create SettlementAllocationStatus enum
CREATE TYPE "SettlementAllocationStatus" AS ENUM (
  'pending',
  'allocated',
  'partial'
);

-- 5. Create financial_events table
CREATE TABLE financial_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id),
  event_type "FinancialEventType" NOT NULL,
  trip_id UUID REFERENCES trips(id),
  payment_method "PaymentMethod",
  idempotency_key VARCHAR(255) UNIQUE,
  description VARCHAR(500) NOT NULL,
  metadata JSONB,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_financial_events_driver_id ON financial_events(driver_id);
CREATE INDEX idx_financial_events_trip_id ON financial_events(trip_id);
CREATE INDEX idx_financial_events_event_type ON financial_events(event_type);
CREATE INDEX idx_financial_events_idempotency_key ON financial_events(idempotency_key);
CREATE INDEX idx_financial_events_created_at ON financial_events(created_at);

-- 6. Create balance_movements table
CREATE TABLE balance_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES financial_events(id),
  balance_type "BalanceType" NOT NULL,
  movement_type "LedgerEntryType" NOT NULL,
  amount INTEGER NOT NULL,
  allocated_from UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_balance_movements_event_id ON balance_movements(event_id);
CREATE INDEX idx_balance_movements_balance_type ON balance_movements(balance_type);
CREATE INDEX idx_balance_movements_movement_type ON balance_movements(movement_type);
CREATE INDEX idx_balance_movements_allocated_from ON balance_movements(allocated_from);

-- 7. Create settlement_allocations table
CREATE TABLE settlement_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_event_id UUID NOT NULL REFERENCES financial_events(id),
  liability_event_id UUID NOT NULL REFERENCES financial_events(id),
  amount INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_settlement_allocations_settlement ON settlement_allocations(settlement_event_id);
CREATE INDEX idx_settlement_allocations_liability ON settlement_allocations(liability_event_id);

-- 8. Add ledger-derived balance columns to drivers
ALTER TABLE drivers ADD COLUMN ledger_earnings_balance INTEGER NOT NULL DEFAULT 0;
ALTER TABLE drivers ADD COLUMN ledger_liability_balance INTEGER NOT NULL DEFAULT 0;
ALTER TABLE drivers ADD COLUMN ledger_settlement_balance INTEGER NOT NULL DEFAULT 0;

-- 9. Add allocation columns to cash_settlements
ALTER TABLE cash_settlements ADD COLUMN allocation_status "SettlementAllocationStatus" NOT NULL DEFAULT 'pending';
ALTER TABLE cash_settlements ADD COLUMN allocated_event_id UUID REFERENCES financial_events(id);
CREATE INDEX idx_cash_settlements_allocation ON cash_settlements(allocation_status);

-- ============================================================================
-- SEED: Projection initialization from existing cached values
-- Uses OLD DB labels (legacy enum values unchanged in database)
-- ============================================================================

-- 10. Seed LIABILITY projection from existing cash_commission_owed
UPDATE drivers d
SET ledger_liability_balance = COALESCE(d.cash_commission_owed, 0);

-- 11. Seed EARNINGS projection from card-trip driver_payout entries (old DB label)
UPDATE drivers d
SET ledger_earnings_balance = COALESCE((
  SELECT SUM(dl.amount) FROM driver_ledger dl
  WHERE dl.driver_id = d.id
  AND dl.entry_type = 'driver_payout'
), 0);

-- 12. Seed SETTLEMENT projection from commission_paid entries (old DB label)
UPDATE drivers d
SET ledger_settlement_balance = COALESCE((
  SELECT SUM(dl.amount) FROM driver_ledger dl
  WHERE dl.driver_id = d.id
  AND dl.entry_type = 'commission_paid'
), 0);

-- ============================================================================
-- NOTE: Historical driver_ledger → financial_events conversion must run
-- as an idempotent application backfill (not SQL) joining trips.payment_method
-- to correctly classify cash vs card trip commission.
-- ============================================================================
