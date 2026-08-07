# Payment Reconciliation Guide

## Overview

This guide covers two scenarios:
1. **Stuck subscription payment** — Driver `00747f58-3982-4ef8-9e48-07752041f2be` paid ₦200 but subscription never activated (webhook never reached the backend).
2. **Overcharged refunds** — Drivers who paid before the price fix were charged ₦500/₦3,000/₦10,000 instead of ₦200/₦1,000/₦2,000.

---

## 1. Fix the Paystack Webhook URL (REQUIRED FIRST)

Before any reconciliation, update the webhook URL in Paystack:

1. Log in to [Paystack Dashboard](https://dashboard.paystack.com)
2. Go to **Settings** → **API Keys & Webhooks**
3. Update the **Webhook URL** to:
   ```
   https://api.hiconnectgo.com/api/payments/webhook
   ```
4. Click **Save**
5. Test by sending a test webhook from the Paystack dashboard

---

## 2. Reconcile Stuck Payment (Driver 00747f58)

### Option A: Automated Script (Recommended)

```bash
# Dry run first
node scripts/reconcile-stuck-payments.js --dry-run --driver-id 00747f58-3982-4ef8-9e48-07752041f2be

# Live run
node scripts/reconcile-stuck-payments.js --driver-id 00747f58-3982-4ef8-9e48-07752041f2be
```

### Option B: Manual via Paystack Dashboard

1. Log in to [Paystack Dashboard](https://dashboard.paystack.com)
2. Go to **Transactions** → search for the driver's email or phone
3. Find the ₦200 transaction with status `success`
4. Click the transaction → copy the **Reference** (starts with `sub_init_`)
5. Click **Resend Webhook** → paste the API webhook URL
6. Wait 30 seconds, then verify the driver's subscription is active

### Option C: Manual via API

```bash
# Find the transaction reference first
curl -H "Authorization: Bearer $PAYSTACK_SECRET_KEY" \
  "https://api.paystack.co/transaction?status=success&per_page=50" | jq '.data[] | select(.reference | startswith("sub_init_"))'

# Then call the webhook endpoint directly
curl -X POST https://api.hiconnectgo.com/api/payments/webhook \
  -H "Content-Type: application/json" \
  -H "x-paystack-signature: <signature>" \
  -d '{"event":"charge.success","data":{"reference":"<reference>","amount":20000,...}}'
```

---

## 3. Refund Overcharged Drivers

### Identify Affected Drivers

Drivers who paid between the time the old prices went live and the fix was deployed:

| Plan | Old Price | Correct Price | Overcharge |
|------|-----------|---------------|------------|
| Daily | ₦500 | ₦200 | ₦300 |
| Weekly | ₦3,000 | ₦1,000 | ₦2,000 |
| Monthly | ₦10,000 | ₦2,000 | ₦8,000 |

### Refund via Paystack Dashboard

1. Go to **Transactions** → find the overcharged transaction
2. Click **Refund** → enter the overcharge amount (e.g., ₦300 for daily)
3. Add a note: "HiGO price correction refund"
4. Confirm the refund

### Refund via API

```bash
curl -X POST "https://api.paystack.co/refund" \
  -H "Authorization: Bearer $PAYSTACK_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{"transaction": "<transaction_id>", "amount": 30000, "reason": "Price correction - daily plan was ₦500 instead of ₦200"}'
```

---

## 4. Verification Checklist

After reconciliation:

- [ ] Paystack webhook URL is set to `https://api.hiconnectgo.com/api/payments/webhook`
- [ ] Driver `00747f58` has an active subscription
- [ ] All overcharged drivers have received partial refunds
- [ ] Test a new subscription purchase end-to-end
- [ ] Verify webhook fires correctly in Paystack dashboard → Logs
