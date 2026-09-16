# PHASE 1B REVISION 4 — CANONICAL FINANCIAL EVENT ARCHITECTURE
## Corrected Design (Migration-Safe)

**Status:** DRAFT — Awaiting approval before Phase 1C  
**Date:** 2026-09-16  
**Revision:** 4 (incorporates migration-safety corrections after Revision 3 review)

---

## CURRENT SCHEMA (Authoritative)

```prisma
// drivers table
model Driver {
  id                    String           @id @default(uuid()) @db.Uuid
  cashCommissionOwed    Int              @default(0) @map("cash_commission_owed") // kobo
  settlementThreshold   Int              @default(500000) @map("settlement_threshold") // kobo
  feeOwed               Decimal          @default(0) @map("fee_owed") @db.Decimal(10, 2)
  ledgerEntries         DriverLedger[]   @relation("DriverLedger")
  settlements           CashSettlement[] @relation("DriverSettlements")
  @@map("drivers")
}

// driver_ledger table
model DriverLedger {
  id              String          @id @default(uuid()) @db.Uuid
  driverId        String          @map("driver_id") @db.Uuid
  tripId          String?         @map("trip_id") @db.Uuid
  entryType       LedgerEntryType @map("entry_type")
  amount          Int             // kobo
  balanceAfter    Int             @map("balance_after")
  description     String
  metadata        Json?           @db.JsonB
  createdAt       DateTime        @default(now()) @map("created_at")
  @@map("driver_ledger")
}

// Legacy LedgerEntryType (current values in database)
enum LedgerEntryType {
  fare_collection       // POSITIVE: driver received fare from passenger (cash)
  cash_collected        // POSITIVE: driver collected cash
  commission_earned     // NEGATIVE: platform commission deduction
  commission_paid       // POSITIVE: driver paid commission (reduces what driver owes)
  driver_payout         // POSITIVE: driver earning credit for card trip
  refund                // NEGATIVE: refund reduces driver balance
  subscription_fee      // NEGATIVE: subscription charge reduces driver balance
}
```

---

## 1. TWO SEPARATE ENUMS: Business Event vs Financial Movement

A **business event** is what happened (trip completed, settlement made).  
A **financial movement** is its accounting effect (earnings credit, liability debit).

These are different dimensions. One business event can create multiple financial movements.

```prisma
// ── BUSINESS EVENT TYPE ──
// What happened in the business domain
enum FinancialEventType {
  TRIP_COMPLETED
  COMMISSION_SETTLED
  SUBSCRIPTION_CHARGED
  SUBSCRIPTION_PAID
  BONUS_GRANTED
  PENALTY_APPLIED
  ADJUSTMENT_CREDITED
  ADJUSTMENT_DEBITED
  REFUND_ISSUED
  ENTRY_REVERSED
}

// ── FINANCIAL MOVEMENT TYPE ──
// How it affects a balance bucket (signed)
enum LedgerEntryType {
  // ── EARNINGS (driver earns) ──
  TRIP_EARNING          // +EARNINGS: driver earned trip fare
  BONUS                 // +EARNINGS: bonus credited
  ADJUSTMENT_CREDIT     // +EARNINGS: manual credit

  // ── LIABILITIES (driver owes platform) ──
  PLATFORM_COMMISSION   // +LIABILITY: cash/outstanding commission owed
  SUBSCRIPTION_CHARGE   // +LIABILITY: subscription owed
  PENALTY               // +LIABILITY: penalty owed
  ADJUSTMENT_DEBIT      // +LIABILITY: additional liability

  // ── SETTLEMENTS (debt repayment) ──
  COMMISSION_PAYMENT    // -LIABILITY + SETTLEMENT: driver settled commission
  SUBSCRIPTION_PAYMENT  // -LIABILITY: driver paid subscription

  // ── PAYOUTS ──
  DRIVER_PAYOUT         // -EARNINGS: platform disbursed funds to driver

  // ── REVERSALS ──
  REFUND                // reverses original entries (sign follows original)
  REVERSAL              // reverses any entry (sign follows original)

  // ── OPERATIONAL ──
  CASH_COLLECTION       // METRIC: driver received cash (not a balance)

  // ── LEGACY (deprecated — database values preserved) ──
  LEGACY_FARE_COLLECTION     @map("fare_collection")
  LEGACY_CASH_COLLECTED      @map("cash_collected")
  LEGACY_COMMISSION_EARNED   @map("commission_earned")
  LEGACY_COMMISSION_PAID     @map("commission_paid")
  LEGACY_DRIVER_PAYOUT       @map("driver_payout")
  LEGACY_REFUND              @map("refund")
  LEGACY_SUBSCRIPTION_FEE    @map("subscription_fee")
}
```

### Correction #6: Legacy Enum @map

Each legacy enum value has an explicit `@map(...)` to preserve the database string value. The TypeScript identifier is `LEGACY_*` to avoid collision with canonical names, but the database value stays the same.

---

## 2. REVISED PRISMA MODELS

### 2a. FinancialEvent (Business Event — Parent)

```prisma
model FinancialEvent {
  id              String               @id @default(uuid()) @db.Uuid
  driverId        String               @map("driver_id") @db.Uuid
  eventType       FinancialEventType   @map("event_type")      // BUSINESS event
  tripId          String?              @map("trip_id") @db.Uuid
  paymentMethod   PaymentMethod?       @map("payment_method")

  idempotencyKey  String?              @unique @map("idempotency_key") @db.VarChar(255)
  description     String               @db.VarChar(500)
  metadata        Json?                @db.JsonB
  version         Int                  @default(1)
  createdAt       DateTime             @default(now()) @map("created_at")

  driver          Driver               @relation("FinancialEvents", fields: [driverId], references: [id])
  trip            Trip?                @relation("TripFinancialEvents", fields: [tripId], references: [id])
  deltas          BalanceMovement[]

  @@index([driverId])
  @@index([tripId])
  @@index([eventType])
  @@index([idempotencyKey])
  @@index([createdAt])
  @@map("financial_events")
}
```

### 2b. BalanceMovement (Financial Movement — Child)

```prisma
model BalanceMovement {
  id              String          @id @default(uuid()) @db.Uuid
  eventId         String          @map("event_id") @db.Uuid
  balanceType     BalanceType     @map("balance_type")     // WHICH bucket
  movementType    LedgerEntryType @map("movement_type")    // WHAT financial effect (Correction #2)
  amount          Int             // kobo: signed relative to balance bucket

  allocatedFrom   String?         @map("allocated_from") @db.Uuid  // settlement allocation
  createdAt       DateTime        @default(now()) @map("created_at")

  event           FinancialEvent  @relation(fields: [eventId], references: [id])

  @@index([eventId])
  @@index([balanceType])
  @@index([movementType])
  @@index([allocatedFrom])
  @@map("balance_movements")
}
```

**Key change:** `movementType LedgerEntryType` added. This is the financial classification (`TRIP_EARNING`, `PLATFORM_COMMISSION`, etc.) that the formulas query on.

### 2c. Supporting Enums

```prisma
enum BalanceType {
  EARNINGS       // Driver's available balance
  LIABILITY      // Driver's commission debt to platform
  SETTLEMENT     // Settlement tracking
  METRIC         // Operational metrics (CASH_COLLECTION)
}

enum SettlementAllocationStatus {
  pending
  allocated
  partial
}
```

### 2d. Driver (Cached Projections)

```prisma
model Driver {
  // ... existing fields ...

  cashCommissionOwed    Int              @default(0) @map("cash_commission_owed")
  settlementThreshold   Int              @default(500000) @map("settlement_threshold")
  feeOwed               Decimal          @default(0) @map("fee_owed") @db.Decimal(10, 2)

  // NEW: ledger-derived balances
  ledgerEarningsBalance   Int            @default(0) @map("ledger_earnings_balance")
  ledgerLiabilityBalance  Int            @default(0) @map("ledger_liability_balance")
  ledgerSettlementBalance Int            @default(0) @map("ledger_settlement_balance")

  // ... rest ...
  ledgerEntries         DriverLedger[]   @relation("DriverLedger")
  settlements           CashSettlement[] @relation("DriverSettlements")
  financialEvents       FinancialEvent[] @relation("FinancialEvents")

  @@map("drivers")
}
```

### 2e. CashSettlement

```prisma
model CashSettlement {
  id              String                      @id @default(uuid()) @db.Uuid
  driverId        String                      @map("driver_id") @db.Uuid
  amount          Int
  method          CashSettlementMethod        @map("method")
  status          CashSettlementStatus        @default(pending)
  reference       String?                     @unique @map("reference")
  confirmedBy     String?                     @map("confirmed_by") @db.Uuid
  confirmedAt     DateTime?                   @map("confirmed_at")
  metadata        Json?                       @db.JsonB
  allocationStatus SettlementAllocationStatus @default(pending) @map("allocation_status")
  allocatedEventId String?                    @map("allocated_event_id") @db.Uuid
  createdAt       DateTime                    @default(now()) @map("created_at")

  driver          Driver                      @relation("DriverSettlements", fields: [driverId], references: [id])

  @@index([driverId])
  @@index([status])
  @@index([createdAt])
  @@map("cash_settlements")
}
```

### 2f. SettlementAllocation

```prisma
model SettlementAllocation {
  id                String          @id @default(uuid()) @db.Uuid
  settlementEventId String          @map("settlement_event_id") @db.Uuid
  liabilityEventId  String          @map("liability_event_id") @db.Uuid
  amount            Int
  createdAt         DateTime        @default(now()) @map("created_at")

  settlementEvent   FinancialEvent  @relation("SettlementSource", fields: [settlementEventId], references: [id])
  liabilityEvent    FinancialEvent  @relation("SettlementTarget", fields: [liabilityEventId], references: [id])

  @@index([settlementEventId])
  @@index([liabilityEventId])
  @@map("settlement_allocations")
}
```

---

## 3. SIGN CONVENTION

**Amounts are signed relative to the balance bucket they affect.**

| Direction | Meaning |
|-----------|---------|
| **+amount** | Increases the balance bucket |
| **-amount** | Decreases the balance bucket |

Applied to every `BalanceMovement`:

| movementType | balanceType | Sign | Effect |
|--------------|-------------|------|--------|
| `TRIP_EARNING` | EARNINGS | **+** | Driver earned → earnings increase |
| `BONUS` | EARNINGS | **+** | Bonus credited → earnings increase |
| `ADJUSTMENT_CREDIT` | EARNINGS | **+** | Manual credit → earnings increase |
| `DRIVER_PAYOUT` | EARNINGS | **-** | Platform disbursed → earnings decrease |
| `PLATFORM_COMMISSION` | LIABILITY | **+** | Cash/outstanding commission owed → liability increases |
| `SUBSCRIPTION_CHARGE` | LIABILITY | **+** | Subscription owed → liability increases |
| `PENALTY` | LIABILITY | **+** | Penalty owed → liability increases |
| `ADJUSTMENT_DEBIT` | LIABILITY | **+** | Additional liability → liability increases |
| `COMMISSION_PAYMENT` | LIABILITY | **-** | Commission settled → liability decreases |
| `COMMISSION_PAYMENT` | SETTLEMENT | **+** | Settlement recorded → settlement increases |
| `SUBSCRIPTION_PAYMENT` | LIABILITY | **-** | Subscription paid → liability decreases |
| `REFUND` | (varies) | (follows original) | Reverses original entry |
| `REVERSAL` | (varies) | (follows original) | Reverses original entry |
| `CASH_COLLECTION` | METRIC | **+** | Cash received → metric increases |

---

## 4. BALANCE FORMULAS (Corrected — No Double-Negation)

**Correction #3:** Movements are already signed. Balances are `SUM(amount)` filtered by `balanceType`. No double-negation.

### Earnings Balance

```sql
ledgerEarningsBalance =
  SUM(amount) FROM balance_movements
  WHERE balanceType = 'EARNINGS'
  AND movementType IN ('TRIP_EARNING', 'BONUS', 'ADJUSTMENT_CREDIT', 'DRIVER_PAYOUT', 'REFUND', 'REVERSAL')
```

Since:
- `TRIP_EARNING` amounts are **positive** (increase earnings)
- `DRIVER_PAYOUT` amounts are **negative** (decrease earnings)
- `REFUND` of a `TRIP_EARNING` is **negative** (decreases earnings)

The `SUM(amount)` naturally gives the correct balance.

### Liability Balance

```sql
ledgerLiabilityBalance =
  SUM(amount) FROM balance_movements
  WHERE balanceType = 'LIABILITY'
  AND movementType IN ('PLATFORM_COMMISSION', 'SUBSCRIPTION_CHARGE', 'PENALTY', 'ADJUSTMENT_DEBIT', 'COMMISSION_PAYMENT', 'SUBSCRIPTION_PAYMENT', 'REFUND', 'REVERSAL')
```

Since:
- `PLATFORM_COMMISSION` amounts are **positive** (increase liability)
- `COMMISSION_PAYMENT` amounts are **negative** (decrease liability)

The `SUM(amount)` naturally gives the correct balance.

### Settlement Balance

```sql
ledgerSettlementBalance =
  SUM(amount) FROM balance_movements
  WHERE balanceType = 'SETTLEMENT'
```

### Cash Collection (Metric)

```sql
totalCashCollected =
  SUM(amount) FROM balance_movements
  WHERE balanceType = 'METRIC'
  AND movementType = 'CASH_COLLECTION'
```

---

## 5. EVENT-TO-MOVEMENT MATRIX

### Trip Completion (Cash — ₦5,000 fare, ₦500 commission)

```
FinancialEvent: eventType = TRIP_COMPLETED
  │
  ├── BalanceMovement: balanceType=EARNINGS   movementType=TRIP_EARNING      +₦4,500
  ├── BalanceMovement: balanceType=LIABILITY  movementType=PLATFORM_COMMISSION +₦500
  └── BalanceMovement: balanceType=METRIC     movementType=CASH_COLLECTION    +₦5,000
```

### Trip Completion (Card — ₦5,000 fare, ₦500 commission)

```
FinancialEvent: eventType = TRIP_COMPLETED
  │
  ├── BalanceMovement: balanceType=EARNINGS   movementType=TRIP_EARNING      +₦4,500
```

**Important:** Card/bank trips do not create driver liability. HiGO already collected the fare and retained its commission at source. Platform revenue recognition for card commission belongs in revenue reporting / a platform ledger, not in the driver's `ledgerLiabilityBalance`.

### Commission Settlement (Driver pays ₦500)

```
FinancialEvent: eventType = COMMISSION_SETTLED
  │
  ├── BalanceMovement: balanceType=LIABILITY  movementType=COMMISSION_PAYMENT -₦500
  └── BalanceMovement: balanceType=SETTLEMENT movementType=COMMISSION_PAYMENT +₦500
```

### Subscription Charge (₦2,000 weekly)

```
FinancialEvent: eventType = SUBSCRIPTION_CHARGED
  │
  └── BalanceMovement: balanceType=LIABILITY  movementType=SUBSCRIPTION_CHARGE +₦2,000
```

### Subscription Payment (Driver pays ₦2,000)

```
FinancialEvent: eventType = SUBSCRIPTION_PAID
  │
  └── BalanceMovement: balanceType=LIABILITY  movementType=SUBSCRIPTION_PAYMENT -₦2,000
```

### Bonus (₦1,000)

```
FinancialEvent: eventType = BONUS_GRANTED
  │
  └── BalanceMovement: balanceType=EARNINGS   movementType=BONUS +₦1,000
```

### Penalty (₦500)

```
FinancialEvent: eventType = PENALTY_APPLIED
  │
  └── BalanceMovement: balanceType=LIABILITY  movementType=PENALTY +₦500
```

### Refund (Reverses trip completion — cash trip)

```
FinancialEvent: eventType = REFUND_ISSUED
  │
  ├── BalanceMovement: balanceType=EARNINGS   movementType=REFUND -₦4,500  (reverses TRIP_EARNING)
  ├── BalanceMovement: balanceType=LIABILITY  movementType=REFUND -₦500    (reverses PLATFORM_COMMISSION)
  └── BalanceMovement: balanceType=METRIC     movementType=REFUND -₦5,000  (reverses CASH_COLLECTION)
```

---

## 6. LEGACY-TO-CANONICAL MAPPING (Corrected)

### Correction #4: Legacy `driver_payout` → Canonical `TRIP_EARNING`

Legacy `driver_payout` is a POSITIVE amount representing driver earning credit for card trips (see `ledger.service.ts:107`). It is NOT a disbursement. Therefore:

| Legacy DB Value | Legacy TS Name | Canonical movementType | Canonical eventType | Notes |
|-----------------|----------------|----------------------|-------------------|-------|
| `fare_collection` | `LEGACY_FARE_COLLECTION` | `TRIP_EARNING` | `TRIP_COMPLETED` | Cash trip earning |
| `cash_collected` | `LEGACY_CASH_COLLECTED` | `CASH_COLLECTION` | `TRIP_COMPLETED` | Cash collection metric |
| `commission_earned` | `LEGACY_COMMISSION_EARNED` | `PLATFORM_COMMISSION` | `TRIP_COMPLETED` | Cash-trip commission liability only; card-trip commission was retained at source |
| `commission_paid` | `LEGACY_COMMISSION_PAID` | `COMMISSION_PAYMENT` | `COMMISSION_SETTLED` | Settlement payment |
| `driver_payout` | `LEGACY_DRIVER_PAYOUT` | `TRIP_EARNING` | `TRIP_COMPLETED` | Card trip earning (NOT payout) |
| `refund` | `LEGACY_REFUND` | `REFUND` | `REFUND_ISSUED` | Refund |
| `subscription_fee` | `LEGACY_SUBSCRIPTION_FEE` | `SUBSCRIPTION_CHARGE` | `SUBSCRIPTION_CHARGED` | Subscription charge |

### Legacy Amount Sign Convention (Current)

| Legacy Entry | Legacy Amount | Meaning |
|--------------|---------------|---------|
| `fare_collection` | **+amount** | Driver received fare |
| `cash_collected` | **+amount** | Driver collected cash |
| `commission_earned` | **-amount** | Platform commission deduction |
| `commission_paid` | **+amount** | Driver paid commission (reduces balance) |
| `driver_payout` | **+amount** | Driver earning credit for card trip |
| `refund` | **-amount** | Refund reduces driver balance |
| `subscription_fee` | **-amount** | Subscription reduces driver balance |

### Correction #5: Backfill Math (Sign and Scope Fix)

Legacy amounts use a DIFFERENT sign convention than canonical amounts. The backfill must convert:

```sql
-- For EARNINGS movements:
-- Legacy positive = driver earned → canonical +amount (same sign)
-- Legacy negative = driver lost → canonical -amount (same sign)
-- So EARNINGS backfill: keep the sign as-is

-- For LIABILITY movements:
-- Legacy negative (commission_earned) = driver owes → canonical +amount (OPPOSITE sign)
-- Legacy positive (commission_paid) = driver paid → canonical -amount (OPPOSITE sign)
-- So historical LIABILITY movement backfill: INVERT the sign

-- Example: legacy commission_earned = -500 → canonical PLATFORM_COMMISSION = +500
-- Example: legacy commission_paid = +500 → canonical COMMISSION_PAYMENT = -500
```

**Scope rule:** Only cash/outstanding commission becomes driver liability. Current code also emits `commission_earned` for card/bank trips, but that commission was retained at source and must not increase `ledgerLiabilityBalance`.

---

## 7. CORRECTED ADDITIVE MIGRATION SQL

```sql
-- ============================================================================
-- PHASE 1C: ADDITIVE MIGRATION (Revision 4)
-- ============================================================================

-- 1. Add new enum values to LedgerEntryType
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

-- 2. DO NOT rename legacy enum DB values.
-- Prisma enum members use LEGACY_* @map("existing_db_value") so existing rows remain valid:
--   LEGACY_FARE_COLLECTION   @map("fare_collection")
--   LEGACY_CASH_COLLECTED    @map("cash_collected")
--   LEGACY_COMMISSION_EARNED @map("commission_earned")
--   LEGACY_COMMISSION_PAID   @map("commission_paid")
--   LEGACY_DRIVER_PAYOUT     @map("driver_payout")
--   LEGACY_REFUND            @map("refund")
--   LEGACY_SUBSCRIPTION_FEE  @map("subscription_fee")

-- 3. Create FinancialEventType enum
CREATE TYPE "FinancialEventType" AS ENUM (
  'TRIP_COMPLETED', 'COMMISSION_SETTLED', 'SUBSCRIPTION_CHARGED',
  'SUBSCRIPTION_PAID', 'BONUS_GRANTED', 'PENALTY_APPLIED',
  'ADJUSTMENT_CREDITED', 'ADJUSTMENT_DEBITED', 'REFUND_ISSUED', 'ENTRY_REVERSED'
);

-- 4. Create BalanceType enum
CREATE TYPE "BalanceType" AS ENUM ('EARNINGS', 'LIABILITY', 'SETTLEMENT', 'METRIC');

-- 5. Create SettlementAllocationStatus enum
CREATE TYPE "SettlementAllocationStatus" AS ENUM ('pending', 'allocated', 'partial');

-- 6. Create financial_events table
CREATE TABLE financial_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id),
  event_type "FinancialEventType" NOT NULL,
  trip_id UUID REFERENCES trips(id),
  payment_method VARCHAR(20),
  idempotency_key VARCHAR(255) UNIQUE,
  description VARCHAR(500) NOT NULL,
  metadata JSONB,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_financial_events_driver_id ON financial_events(driver_id);
CREATE INDEX idx_financial_events_trip_id ON financial_events(trip_id);
CREATE INDEX idx_financial_events_event_type ON financial_events(event_type);
CREATE INDEX idx_financial_events_idempotency_key ON financial_events(idempotency_key);
CREATE INDEX idx_financial_events_created_at ON financial_events(created_at);

-- 7. Create balance_movements table
CREATE TABLE balance_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES financial_events(id),
  balance_type "BalanceType" NOT NULL,
  movement_type "LedgerEntryType" NOT NULL,
  amount INTEGER NOT NULL,
  allocated_from UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_balance_movements_event_id ON balance_movements(event_id);
CREATE INDEX idx_balance_movements_balance_type ON balance_movements(balance_type);
CREATE INDEX idx_balance_movements_movement_type ON balance_movements(movement_type);
CREATE INDEX idx_balance_movements_allocated_from ON balance_movements(allocated_from);

-- 8. Create settlement_allocations table
CREATE TABLE settlement_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_event_id UUID NOT NULL REFERENCES financial_events(id),
  liability_event_id UUID NOT NULL REFERENCES financial_events(id),
  amount INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_settlement_allocations_settlement ON settlement_allocations(settlement_event_id);
CREATE INDEX idx_settlement_allocations_liability ON settlement_allocations(liability_event_id);

-- 9. Add ledger-derived balance columns to drivers
ALTER TABLE drivers ADD COLUMN ledger_earnings_balance INTEGER DEFAULT 0;
ALTER TABLE drivers ADD COLUMN ledger_liability_balance INTEGER DEFAULT 0;
ALTER TABLE drivers ADD COLUMN ledger_settlement_balance INTEGER DEFAULT 0;

-- 10. Add allocation columns to cash_settlements
ALTER TABLE cash_settlements ADD COLUMN allocation_status "SettlementAllocationStatus" NOT NULL DEFAULT 'pending';
ALTER TABLE cash_settlements ADD COLUMN allocated_event_id UUID REFERENCES financial_events(id);
CREATE INDEX idx_cash_settlements_allocation ON cash_settlements(allocation_status);

-- ============================================================================
-- ADDITIVE PROJECTION SEED ONLY
-- ============================================================================

-- Historical conversion from driver_ledger to financial_events + balance_movements
-- must run as an idempotent application backfill after this migration. It must group
-- entries by trip_id/settlement reference and join trips.payment_method so card-trip
-- commission_earned rows do NOT become driver liability.

-- 11. Seed EARNINGS projection from legacy entries that are already net driver earnings.
-- Do not include cash_collected: it is METRIC, not earnings. Cash-trip net earnings
-- require a trip-aware historical backfill because current legacy rows split cash
-- collection (+fare) and commission (-commission).
UPDATE drivers d
SET ledger_earnings_balance = COALESCE((
  SELECT SUM(dl.amount) FROM driver_ledger dl
  WHERE dl.driver_id = d.id
  AND dl.entry_type IN (
    'driver_payout',         -- +amount (card trip earning credit)
    'refund'                 -- -amount (reduces earnings)
  )
), 0);

-- 12. Seed LIABILITY projection from the existing cached source of truth.
-- Do not aggregate all commission_earned rows: current code emits commission_earned
-- for both cash and card trips, and card-trip commission is retained at source.
-- cash_commission_owed already represents outstanding cash commission only.
UPDATE drivers d
SET ledger_liability_balance = COALESCE(d.cash_commission_owed, 0);

-- 13. Seed SETTLEMENT projection
-- Only commission_paid entries represent settlements
UPDATE drivers d
SET ledger_settlement_balance = COALESCE((
  SELECT SUM(dl.amount) FROM driver_ledger dl
  WHERE dl.driver_id = d.id
  AND dl.entry_type = 'commission_paid'  -- legacy +amount = settlement
), 0);

-- 14. Verify backfill correctness
-- Expected: ledger_liability_balance should match cash_commission_owed
SELECT
  d.id AS driver_id,
  d.cash_commission_owed AS legacy_owed,
  d.ledger_liability_balance AS ledger_owed,
  ABS(d.cash_commission_owed - d.ledger_liability_balance) AS diff
FROM drivers d
WHERE ABS(d.cash_commission_owed - d.ledger_liability_balance) > 1;

-- ============================================================================
-- DO NOT RUN UNTIL APPROVED BY USER
-- ============================================================================
```

---

## 8. IDEMPOTENCY / P2002 HANDLING (Unchanged from Rev 2)

```typescript
async createFinancialEvent(data: CreateFinancialEventDto): Promise<FinancialEvent> {
  // 1. Pre-check (optimization)
  const existing = await this.prisma.financialEvent.findUnique({
    where: { idempotencyKey: data.idempotencyKey },
    include: { deltas: true },
  });
  if (existing) return existing;

  // 2. Attempt transaction
  try {
    return await this.prisma.$transaction(async (tx) => {
      const event = await tx.financialEvent.create({
        data: {
          driverId: data.driverId,
          eventType: data.eventType,
          tripId: data.tripId,
          paymentMethod: data.paymentMethod,
          idempotencyKey: data.idempotencyKey,
          description: data.description,
          metadata: data.metadata,
        },
      });

      for (const delta of data.deltas) {
        await tx.balanceMovement.create({
          data: {
            eventId: event.id,
            balanceType: delta.balanceType,
            movementType: delta.movementType,
            amount: delta.amount,
          },
        });
      }

      await this.updateDriverProjections(tx, data.driverId, data.deltas);

      return tx.financialEvent.findUnique({
        where: { id: event.id },
        include: { deltas: true },
      });
    });
  } catch (error) {
    // 3. Catch P2002 (unique constraint violation)
    if (error.code === 'P2002' && error.meta?.target?.includes('idempotency_key')) {
      // 4. Fetch existing record
      const alreadyCreated = await this.prisma.financialEvent.findUnique({
        where: { idempotencyKey: data.idempotencyKey },
        include: { deltas: true },
      });
      if (alreadyCreated) return alreadyCreated;
      throw error;
    }
    throw error;
  }
}
```

---

## 9. CONCURRENCY STRATEGY (Unchanged from Rev 2)

- Optimistic locking via `version` field
- Transaction isolation for settlement allocation (`Serializable`)
- Redis distributed locks for cross-service operations

---

## 10. SETTLEMENT ALLOCATION (Unchanged from Rev 2)

FIFO allocation: settlements resolve oldest outstanding liabilities first.

```
SettlementAllocation links:
  settlementEventId → FinancialEvent (COMMISSION_SETTLED)
  liabilityEventId  → FinancialEvent (cash TRIP_COMPLETED with PLATFORM_COMMISSION)
  amount            → portion of settlement allocated to this liability
```

---

## 11. SUMMARY OF ALL CORRECTIONS

| # | Correction | Applied |
|---|-----------|---------|
| 1 | Separate `FinancialEventType` from `LedgerEntryType` | ✅ New `FinancialEventType` enum for business events; `LedgerEntryType` for financial movements |
| 2 | Add `movementType` to `BalanceMovement` | ✅ `movementType LedgerEntryType` added |
| 3 | Fix double-negation in formulas | ✅ Formulas now use `SUM(amount) WHERE balanceType = X` |
| 4 | Fix legacy `driver_payout` → `TRIP_EARNING` | ✅ Mapped correctly (not `DRIVER_PAYOUT`) |
| 5 | Fix backfill sign and scope | ✅ Projection seed uses `cash_commission_owed`; historical movement backfill must invert signs only for cash/outstanding liabilities |
| 6 | Add `@map` to legacy enums, add missing `REFUND` | ✅ All legacy values have `@map(...)`, canonical `REFUND` included |
| 7 | Preserve legacy enum DB values | ✅ Removed `ALTER TYPE ... RENAME VALUE`; existing DB labels remain unchanged |
| 8 | Prevent card commission from becoming driver liability | ✅ Card/bank trips create earnings only; retained platform commission is not added to `ledgerLiabilityBalance` |

---

## 12. NEXT STEPS

After approval, Phase 1C will:
1. Code the additive Prisma migration above
2. Create `FinancialEventService` with idempotent create method
3. Update `LedgerService` to write to both `DriverLedger` (backward compat) and `FinancialEvent` + `BalanceMovement`
4. Add idempotent historical conversion backfill for `driver_ledger` → `financial_events` + `balance_movements`
5. Add settlement allocation logic (FIFO)
6. Add reconciliation endpoints

**NO PRODUCTION MIGRATION IS APPROVED UNTIL THIS REVISION PASSES REVIEW.**
