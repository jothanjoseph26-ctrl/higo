# Financial Ledger Engine — Test Guide

**Version:** Phase 1D (post-deployment)
**Date:** September 2026
**Environment:** Production (api.hiconnectgo.com)

---

## What We Built

A dual-entry financial ledger that tracks every kobo flowing through the platform. It sits alongside the existing `driver_ledger` table (legacy) and records all financial events in a new `financial_events` + `balance_movements` architecture.

**Key concept:** Every financial transaction creates a `FinancialEvent` (parent) with one or more `BalanceMovement` entries (children). Each movement is signed relative to its balance bucket (+increases, -decreases).

### Balance Buckets

| Bucket | What it tracks | Positive means |
|--------|---------------|----------------|
| `EARNINGS` | Driver's available balance | Driver has money |
| `LIABILITY` | Driver's debt to platform | Driver owes money |
| `SETTLEMENT` | Settlements received | Platform collected |
| `METRIC` | Operational metrics (cash collected) | Informational |

### Financial Event Types

| Event Type | When it fires | Typical deltas |
|------------|--------------|----------------|
| `TRIP_COMPLETED` | Trip ends | EARNINGS +fare (card) or EARNINGS +fare + LIABILITY +commission (cash) |
| `COMMISSION_SETTLED` | Admin settles cash commission | LIABILITY -amount, SETTLEMENT +amount |
| `SUBSCRIPTION_PAID` | Driver pays subscription | LIABILITY -amount, SETTLEMENT +amount |
| `SUBSCRIPTION_CHARGED` | Free coupon subscription | LIABILITY 0 (audit trail) |
| `REFUND_ISSUED` | Trip refunded | EARNINGS -refundAmount |
| `PAYOUT_COMPLETED` | Driver withdraws | EARNINGS -amount |
| `BONUS_GRANTED` | (Not yet wired) | EARNINGS +amount |
| `PENALTY_APPLIED` | (Not yet wired) | EARNINGS -amount |

### Idempotency

Every event type has a unique idempotency key to prevent duplicates:
- Trip: `trip:{tripId}:completed`
- Settlement: `settlement:{settlementId}`
- Subscription: `subscription:{subscriptionId}:activated`
- Refund: `refund:{tripId}:{refundReference}`
- Payout: `payout:{transferReference}`

---

## Test Scenarios

### Scenario 1: Card Trip Completion

**Setup:** Book a card-paid trip (driver accepts, completes ride)
**Expected:**
- `financial_events` row: `eventType = TRIP_COMPLETED`, `idempotencyKey = trip:{tripId}:completed`
- `balance_movements` rows:
  - `EARNINGS / TRIP_EARNING / +totalFare`
  - `METRIC / CASH_COLLECTION / 0` (card trips have no cash collected)
- `drivers.ledger_earnings_balance` incremented by `totalFare`

**Verify:**
```
GET /api/admin/settlements/balances/{driverId}
```
Check `earnings` increased by the fare amount.

---

### Scenario 2: Cash Trip Completion

**Setup:** Book a cash-paid trip
**Expected:**
- `financial_events` row: `eventType = TRIP_COMPLETED`
- `balance_movements` rows:
  - `EARNINGS / TRIP_EARNING / +totalFare`
  - `METRIC / CASH_COLLECTION / +totalFare`
  - `LIABILITY / PLATFORM_COMMISSION / +commissionAmount` (10% of fare)
- `drivers.ledger_earnings_balance` incremented by `totalFare`
- `drivers.ledger_liability_balance` incremented by `commissionAmount`

**Verify:** Cash trip creates a commission liability (driver owes platform 10%).

---

### Scenario 3: Commission Settlement

**Setup:** Admin confirms cash settlement for a driver with outstanding commission
**Expected:**
- `financial_events` row: `eventType = COMMISSION_SETTLED`
- `balance_movements` rows:
  - `LIABILITY / COMMISSION_PAYMENT / -settledAmount`
  - `SETTLEMENT / COMMISSION_PAYMENT / +settledAmount`
- `drivers.ledger_liability_balance` decremented by `settledAmount`
- `drivers.ledger_settlement_balance` incremented by `settledAmount`

**Verify:** Settlement clears the driver's commission debt.

---

### Scenario 4: Subscription Payment (Paystack)

**Setup:** Driver purchases subscription via Paystack checkout
**Expected:**
- `financial_events` row: `eventType = SUBSCRIPTION_PAID`
- `balance_movements` rows:
  - `LIABILITY / SUBSCRIPTION_PAYMENT / -subscriptionAmount`
  - `SETTLEMENT / SUBSCRIPTION_PAYMENT / +subscriptionAmount`

**Verify:** Paid subscription records payment, not a charge.

---

### Scenario 5: Admin Cash Subscription

**Setup:** Admin activates subscription for driver who paid cash at office
**Expected:**
- Same as Scenario 4 but triggered by admin action
- `eventType = SUBSCRIPTION_PAID`
- Metadata includes `adminId` and `reason: cash_paid_at_office`

---

### Scenario 6: Subscription Coupon (Free)

**Setup:** Driver applies a promo coupon for free subscription
**Expected:**
- `financial_events` row: `eventType = SUBSCRIPTION_CHARGED`
- `balance_movements` row:
  - `LIABILITY / SUBSCRIPTION_CHARGE / 0` (zero-value audit trail)
- No change to driver balances (amount is 0)

**Verify:** Free subscription is recorded for audit but doesn't affect balances.

---

### Scenario 7: Refund

**Setup:** Admin processes a refund for a trip
**Expected:**
- `financial_events` row: `eventType = REFUND_ISSUED`
- `balance_movements` row:
  - `EARNINGS / REFUND / -refundAmount`
- `drivers.ledger_earnings_balance` decremented by `refundAmount`

**Verify:** Refund reverses the driver's earning for that trip.

---

### Scenario 8: Driver Payout (Withdrawal)

**Setup:** Driver withdraws available balance via Paystack transfer
**Expected:**
- `financial_events` row: `eventType = PAYOUT_COMPLETED`
- `balance_movements` row:
  - `EARNINGS / DRIVER_PAYOUT / -withdrawalAmount`
- `drivers.ledger_earnings_balance` decremented by `withdrawalAmount`

**Verify:** Payout reduces driver's available earnings.

---

### Scenario 9: Idempotency (Duplicate Prevention)

**Setup:** Trigger the same event twice (e.g., retry trip completion)
**Expected:**
- Only ONE `financial_events` row with that `idempotencyKey`
- Second call returns the existing event (no duplicate)
- Balances unchanged after second call

**Verify:**
```
GET /api/admin/settlements/balances/{driverId}
```
Balances should match — no double-counting.

---

### Scenario 10: Reconciliation

**Setup:** Run reconciliation for any driver
**Expected:**
```
GET /api/admin/settlements/reconcile/{driverId}
```
Returns `diff: 0` for all balance types (cached projections match ledger-derived totals).

**If diff > 0:** There's a bug in dual-write or projection update.

---

## API Endpoints for Testing

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/admin/settlements/balances/{driverId}` | GET | Admin | Driver's ledger balances |
| `/api/admin/settlements/reconcile/{driverId}` | GET | Admin | Compare cached vs computed balances |
| `/api/admin/settlements/backfill-all` | POST | Admin | Re-run historical backfill (idempotent) |
| `/api/admin/settlements/backfill/{driverId}` | POST | Admin | Backfill single driver |

---

## What to Watch For

### Red Flags (Bugs)
1. **Duplicate events** — Same `idempotencyKey` appears twice in `financial_events`
2. **Wrong signs** — EARNINGS should be positive for trip earnings, negative for refunds/payouts
3. **Missing movements** — Trip completion should create 2-3 movements, not 1
4. **Projection drift** — `ledger_earnings_balance` doesn't match sum of `balance_movements`
5. **Subscription labeled as CHARGED** — Paid subscriptions should be `SUBSCRIPTION_PAID`, not `SUBSCRIPTION_CHARGED`

### Expected Behaviors
- Legacy `driver_ledger` entries continue to be created (backward compatibility)
- New `financial_events` entries are created alongside (dual-write)
- Dual-write failures are logged but don't block the legacy flow
- Backfill is idempotent — running it twice doesn't create duplicates

---

## Database Queries for Debugging

```sql
-- Check financial events for a driver
SELECT id, event_type, idempotency_key, description, created_at
FROM financial_events
WHERE driver_id = '{driverId}'
ORDER BY created_at DESC;

-- Check balance movements for a driver
SELECT fe.event_type, bm.balance_type, bm.movement_type, bm.amount
FROM balance_movements bm
JOIN financial_events fe ON bm.event_id = fe.id
WHERE fe.driver_id = '{driverId}'
ORDER BY fe.created_at DESC;

-- Check for duplicate idempotency keys
SELECT idempotency_key, COUNT(*)
FROM financial_events
GROUP BY idempotency_key
HAVING COUNT(*) > 1;

-- Compare cached vs computed balances
SELECT
  d.ledger_earnings_balance as cached_earnings,
  COALESCE(SUM(CASE WHEN bm.balance_type = 'EARNINGS' THEN bm.amount ELSE 0 END), 0) as computed_earnings,
  ABS(d.ledger_earnings_balance - COALESCE(SUM(CASE WHEN bm.balance_type = 'EARNINGS' THEN bm.amount ELSE 0 END), 0)) as diff
FROM drivers d
LEFT JOIN financial_events fe ON fe.driver_id = d.id
LEFT JOIN balance_movements bm ON bm.event_id = fe.id
WHERE d.id = '{driverId}'
GROUP BY d.id;
```

---

## Sign-Off Checklist

- [ ] Card trip creates correct EARNINGS movement
- [ ] Cash trip creates EARNINGS + METRIC + LIABILITY movements
- [ ] Settlement clears LIABILITY and increases SETTLEMENT
- [ ] Paid subscription uses `SUBSCRIPTION_PAID` (not `SUBSCRIPTION_CHARGED`)
- [ ] Refund decreases EARNINGS
- [ ] Payout decreases EARNINGS
- [ ] Idempotency prevents duplicate events
- [ ] Reconciliation shows `diff: 0` for all balance types
- [ ] Legacy `driver_ledger` entries still being created
- [ ] No errors in production logs
