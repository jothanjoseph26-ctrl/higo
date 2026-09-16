# Task 2-1: Cash + Paystack Payment Flow

**Agent:** Agent F
**Phase:** 2 — Payment Integration
**Depends on:** Phase 1A complete
**Blocks:** None
**Effort:** 2 days

---

## Context

Phase 1A defaults to cash-only payments. This task adds online payment support via Paystack. The flow: passenger selects "Pay Online" → generate Paystack checkout link → send in WhatsApp → passenger pays → Paystack webhook confirms → trip is dispatched.

---

## Exact Changes

### 1. Add payment selection to booking orchestrator

**Modify:** `apps/api/src/whatsapp/booking-orchestrator.service.ts`

In `confirmRide()`, handle payment method selection:

```typescript
async confirmRide(
  conversationId: string,
  paymentMethod: string = 'cash',
): Promise<BookingResponse> {
  // ... existing validation ...

  if (paymentMethod === 'card' || paymentMethod === 'bank') {
    // Online payment flow
    return this.initiateOnlinePayment(conversationId, booking);
  }

  // Cash flow — existing code
  // ...
}

private async initiateOnlinePayment(
  conversationId: string,
  booking: ActiveBooking,
): Promise<BookingResponse> {
  if (!booking.fareEstimate || !booking.tripId) {
    return {
      state: ConversationState.IDLE,
      messages: [{ type: 'text', text: 'Payment setup failed. Please try again.' }],
    };
  }

  try {
    // Generate signed checkout token
    const reference = `wa_trip_${booking.tripId}_${Date.now()}`;
    const amount = booking.fareEstimate.totalFare;

    // Create Paystack checkout URL
    // The checkout URL will be sent via WhatsApp
    const checkoutUrl = `https://checkout.paystack.com/${reference}`;

    return {
      state: ConversationState.SELECTING_PAYMENT,
      messages: [{
        type: 'text',
        text: `💳 Online Payment\n\n` +
          `Amount: ₦${amount.toLocaleString()}\n\n` +
          `Click the link below to pay:\n${checkoutUrl}\n\n` +
          `After payment, your ride will be confirmed automatically.\n\n` +
          `⏰ Link expires in 10 minutes.`,
      }],
    };
  } catch (error) {
    return {
      state: ConversationState.CONFIRMING_RIDE,
      messages: [{ type: 'text', text: `Payment setup failed: ${error.message}. Try cash instead?` }],
    };
  }
}
```

### 2. Handle Paystack webhook for WhatsApp trips

**Modify:** `apps/api/src/payments/payment.service.ts`

The existing `charge.success` handler (line 262) already dispatches matching after payment confirmation. No changes needed — the webhook flow is channel-agnostic.

Verify: When a WhatsApp trip's payment webhook fires, it should:
1. Set `paymentStatus` to `held`
2. Trigger `matchingService.dispatch(tripId)`
3. The `TripRequested` event fires → WhatsAppNotificationListener sends "Searching for driver..."

### 3. Add payment confirmation notification

**Modify:** `apps/api/src/whatsapp/notification.listener.ts`

```typescript
@OnEvent('payment.confirmed')
async handlePaymentConfirmed(event: { tripId: string; amount: number }): Promise<void> {
  const conversation = await this.findConversationByTripId(event.tripId, 'passenger');
  if (!conversation) return;

  try {
    await this.whatsappService.sendMessage(
      await this.getPhoneNumberId(),
      conversation.whatsappPhone,
      `✅ Payment confirmed!\n\n💰 ₦${event.amount.toLocaleString()} received.\n\n🔍 Searching for a driver...`,
      await this.getAccessToken(),
    );
  } catch (error) {
    this.logger.error(`Failed to send payment confirmation: ${error.message}`);
  }
}
```

### 4. Add signed URL generation

**Modify:** `apps/api/src/whatsapp/booking-orchestrator.service.ts`

Add method for generating signed Paystack references:

```typescript
private generateSignedReference(tripId: string, amount: number): string {
  // Include tripId + amount + timestamp for replay protection
  const payload = `${tripId}:${amount}:${Date.now()}`;
  const hash = crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
  return `wa_${tripId.slice(0, 8)}_${hash}`;
}
```

---

## Acceptance Criteria

- [ ] Passenger can select "Cash" or "Pay Online" during booking
- [ ] Cash flow creates trip immediately and dispatches
- [ ] Online flow generates Paystack checkout link
- [ ] Checkout link sent via WhatsApp message
- [ ] Paystack webhook confirms payment and triggers dispatch
- [ ] Payment confirmation notification sent to passenger
- [ ] Reference is signed/unique per trip to prevent replay
- [ ] `pnpm build api` compiles without errors

---

## Verification

```bash
cd apps/api
pnpm build
# Verify: cash flow creates trip with paymentMethod='cash'
# Verify: online flow generates checkout reference
# Verify: webhook handler processes WhatsApp trip payments
```
