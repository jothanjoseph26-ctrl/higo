# Task 1A-8: Passenger Booking Flow

**Agent:** Agent B + C
**Phase:** 1A — Passenger MVP
**Depends on:** 1A-2 (Schema), 1A-3 (Interactive Msgs), 1A-5 (FSM), 1A-6 (Orchestrator), 1A-7 (Module Wiring)
**Blocks:** 1A-9 (Notification Listener), Phase 1B, Phase 2-5
**Effort:** 2 days

---

## Context

This is the main integration task that wires everything together. The WhatsApp service handles inbound messages, routes them through the FSM, calls the Orchestrator, and translates Orchestrator responses into WhatsApp messages.

---

## Exact Changes

### 1. Rewrite the inbound message handler

**Modify:** `apps/api/src/whatsapp/whatsapp.service.ts`

Add to constructor:
```typescript
constructor(
  private readonly prisma: PrismaService,
  @Optional() private readonly hce?: HceService,
  private readonly orchestrator?: BookingOrchestrator,
  private readonly idempotency?: IdempotencyService,
) {}
```

Replace `processIncomingMessage` method (line 150) with:

```typescript
private async processIncomingMessage(
  msg: WhatsAppMessagePayload['entry'][0]['changes'][0]['value']['messages'][0],
  contact: WhatsAppMessagePayload['entry'][0]['changes'][0]['value']['contacts'][0] | undefined,
  phoneNumberId: string,
  displayPhoneNumber: string,
): Promise<void> {
  const startTime = Date.now();

  try {
    // 1. Idempotency check
    if (this.idempotency) {
      const isDuplicate = await this.idempotency.isDuplicateMessage(msg.id);
      if (isDuplicate) {
        this.logger.debug(`Duplicate message ${msg.id}, skipping`);
        return;
      }
    }

    // 2. Get or create config
    const config = await this.getOrCreateConfig(phoneNumberId);
    if (!config) {
      this.logger.error(`No config found for phone_number_id: ${phoneNumberId}`);
      return;
    }

    await this.prisma.whatsAppConfig.update({
      where: { id: config.id },
      data: { lastWebhookReceivedAt: new Date() },
    });

    // 3. Parse inbound message
    const parsed = this.parseInboundMessage(msg);
    if (parsed.type === 'unknown') {
      this.logger.debug(`Ignoring unsupported message type from ${msg.from}: ${msg.type}`);
      return;
    }

    // 4. Get or create conversation
    const conversation = await this.getOrCreateConversation(
      config.id,
      msg.from,
      contact?.profile?.name,
    );

    // 5. Log inbound message
    const textContent = parsed.text || (parsed.location ? `Location: ${parsed.location.lat},${parsed.location.lng}` : '');
    await this.logInboundMessage(conversation.id, msg, textContent);

    await this.prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: {
        lastUserMessage: textContent,
        messageCount: { increment: 1 },
        lastMessageAt: new Date(),
      },
    });

    // 6. Check for human handoff
    if (conversation.isHumanHandoff || conversation.conversationState === 'human_handoff') {
      this.logger.debug(`Conversation ${conversation.id} in human handoff, skipping bot`);
      return;
    }

    // 7. Session expiry check
    if (conversation.sessionExpiresAt && conversation.sessionExpiresAt < new Date()) {
      await this.prisma.whatsAppConversation.update({
        where: { id: conversation.id },
        data: {
          conversationState: 'idle',
          activeBooking: null,
          sessionExpiresAt: null,
        },
      });
      await this.sendMessage(config.phoneNumberId, msg.from,
        '⏰ Your session expired. Let\'s start fresh!', config.accessToken);
    }

    // 8. Detect language
    if (parsed.text) {
      const detectedLang = this.detectLanguage(parsed.text, conversation.preferredLanguage);
      if (detectedLang !== conversation.preferredLanguage) {
        await this.prisma.whatsAppConversation.update({
          where: { id: conversation.id },
          data: { preferredLanguage: detectedLang },
        });
      }
    }

    // 9. Route through FSM + Orchestrator
    const response = await this.routeMessage(conversation, parsed, config.phoneNumberId);

    // 10. Send response
    if (response) {
      await this.sendBookingResponse(config.phoneNumberId, msg.from, response, config.accessToken);
      await this.logOutboundMessage(conversation.id, JSON.stringify(response), { success: true });
    }

    const duration = Date.now() - startTime;
    this.logger.log(
      `Processed message from ${msg.from} in ${duration}ms | state=${conversation.conversationState}`,
    );
  } catch (error) {
    this.logger.error(`Error processing message from ${msg.from}:`, error);
    this.recordError(ErrorType.TEMPORARY_FAILURE, error.message, { from: msg.from });
  }
}
```

### 2. Add message routing method

**Modify:** `apps/api/src/whatsapp/whatsapp.service.ts`

Add new method:

```typescript
private async routeMessage(
  conversation: {
    id: string;
    conversationState: string;
    role: string;
    preferredLanguage: string;
    whatsappPhone: string;
    activeBooking: unknown;
    activeTripId: string | null;
  },
  parsed: ParsedInboundMessage,
  phoneNumberId: string,
): Promise<BookingResponse | null> {
  const state = conversation.conversationState as ConversationState;
  const lang = conversation.preferredLanguage || 'en';

  // Global commands — available in every state
  if (parsed.text) {
    const lower = parsed.text.toLowerCase().trim();

    if (['menu', 'start', 'hi', 'hello'].includes(lower)) {
      if (state !== ConversationState.IDLE) {
        await this.prisma.whatsAppConversation.update({
          where: { id: conversation.id },
          data: { conversationState: 'idle', activeBooking: null, activeTripId: null },
        });
      }
      return this.getMenuResponse(conversation, lang);
    }

    if (lower === 'help' || lower === 'support') {
      return {
        state: ConversationState.HUMAN_HANDOFF,
        messages: [{ type: 'text', text: this.t('support_response', lang) }],
      };
    }

    if (lower === 'cancel') {
      if (this.orchestrator) {
        return this.orchestrator.cancelBooking(conversation.id);
      }
    }

    if (lower === 'restart') {
      await this.prisma.whatsAppConversation.update({
        where: { id: conversation.id },
        data: { conversationState: 'idle', activeBooking: null, activeTripId: null },
      });
      return this.getMenuResponse(conversation, lang);
    }
  }

  // Registration flow (existing — keep as-is)
  if (state.startsWith('awaiting_passenger_') || state.startsWith('awaiting_driver_')) {
    return this.handleRegistrationState(conversation, parsed, lang);
  }

  // No orchestrator — fallback to existing behavior
  if (!this.orchestrator) {
    return this.handleIdleState(conversation, parsed.text || '', 'general', lang);
  }

  // Booking flow — route by conversation state
  switch (state) {
    case ConversationState.IDLE:
      return this.handleIdleBooking(conversation, parsed, lang);

    case ConversationState.AWAITING_PICKUP:
      return this.handlePickupInput(conversation, parsed);

    case ConversationState.AWAITING_DESTINATION:
      return this.handleDestinationInput(conversation, parsed);

    case ConversationState.SELECTING_VEHICLE:
      return this.handleVehicleSelection(conversation, parsed);

    case ConversationState.CONFIRMING_RIDE:
      return this.handleConfirmation(conversation, parsed);

    case ConversationState.SELECTING_PAYMENT:
      return this.handlePaymentSelection(conversation, parsed);

    case ConversationState.WAITING_FOR_MATCH:
    case ConversationState.TRIP_ACTIVE:
      return this.handleActiveTrip(conversation, parsed, lang);

    case ConversationState.AWAITING_RATING:
      return this.handleRating(conversation, parsed);

    default:
      return this.getMenuResponse(conversation, lang);
  }
}
```

### 3. Add booking flow handler methods

**Modify:** `apps/api/src/whatsapp/whatsapp.service.ts`

Add these methods:

```typescript
private async handleIdleBooking(
  conversation: { id: string; preferredLanguage: string },
  parsed: ParsedInboundMessage,
  lang: string,
): Promise<BookingResponse> {
  if (!this.orchestrator) return null;

  const lower = parsed.text?.toLowerCase().trim() || '';

  // Intent detection
  if (['book', 'ride', 'book ride', 'book a ride'].includes(lower)) {
    return this.orchestrator.startBooking(conversation.id);
  }

  // NLP shortcut: "from X to Y" pattern
  if (parsed.text) {
    const match = parsed.text.match(/(?:from|pickup)\s+(.+?)\s+(?:to|dest|drop)\s+(.+)/i);
    if (match) {
      // Pre-fill both pickup and destination
      const pickupResult = await this.orchestrator.handlePickup(conversation.id, {
        type: 'text', text: match[1],
      });
      if (pickupResult.state === ConversationState.AWAITING_DESTINATION) {
        return this.orchestrator.handleDestination(conversation.id, {
          type: 'text', text: match[2],
        });
      }
    }
  }

  // Default: show menu
  return this.getMenuResponse(conversation, lang);
}

private async handlePickupInput(
  conversation: { id: string },
  parsed: ParsedInboundMessage,
): Promise<BookingResponse> {
  if (!this.orchestrator) return null;

  if (parsed.type === 'location' && parsed.location) {
    return this.orchestrator.handlePickup(conversation.id, {
      type: 'location',
      lat: parsed.location.lat,
      lng: parsed.location.lng,
      address: parsed.location.address,
    });
  }

  if (parsed.text) {
    // Check for button taps
    if (parsed.buttonId === 'share_location') {
      return {
        state: ConversationState.AWAITING_PICKUP,
        messages: [{ type: 'text', text: '📍 Please share your location pin using WhatsApp\'s location feature.\n\nTap the attachment icon (📎) → Location → Send your location.' }],
      };
    }
    if (parsed.buttonId === 'enter_address') {
      return {
        state: ConversationState.AWAITING_PICKUP,
        messages: [{ type: 'text', text: '✏️ Please type your pickup address:' }],
      };
    }

    return this.orchestrator.handlePickup(conversation.id, {
      type: 'text', text: parsed.text,
    });
  }

  return {
    state: ConversationState.AWAITING_PICKUP,
    messages: [{
      type: 'buttons',
      text: '📍 Please share your pickup location:',
      buttons: [
        { id: 'share_location', title: '📍 Share Location' },
        { id: 'enter_address', title: '✏️ Enter Address' },
      ],
    }],
  };
}

private async handleDestinationInput(
  conversation: { id: string },
  parsed: ParsedInboundMessage,
): Promise<BookingResponse> {
  if (!this.orchestrator) return null;

  if (parsed.type === 'location' && parsed.location) {
    return this.orchestrator.handleDestination(conversation.id, {
      type: 'location',
      lat: parsed.location.lat,
      lng: parsed.location.lng,
      address: parsed.location.address,
    });
  }

  if (parsed.text) {
    if (parsed.buttonId === 'share_location') {
      return {
        state: ConversationState.AWAITING_DESTINATION,
        messages: [{ type: 'text', text: '📍 Please share your destination using WhatsApp\'s location feature.' }],
      };
    }
    if (parsed.buttonId === 'enter_address') {
      return {
        state: ConversationState.AWAITING_DESTINATION,
        messages: [{ type: 'text', text: '✏️ Please type your destination address:' }],
      };
    }

    return this.orchestrator.handleDestination(conversation.id, {
      type: 'text', text: parsed.text,
    });
  }

  return {
    state: ConversationState.AWAITING_DESTINATION,
    messages: [{
      type: 'buttons',
      text: '🏁 Where are you going?',
      buttons: [
        { id: 'share_location', title: '📍 Share Location' },
        { id: 'enter_address', title: '✏️ Enter Address' },
      ],
    }],
  };
}

private async handleVehicleSelection(
  conversation: { id: string },
  parsed: ParsedInboundMessage,
): Promise<BookingResponse> {
  if (!this.orchestrator) return null;

  // Handle list selection
  if (parsed.listRowId) {
    const vehicleType = parsed.listRowId.replace('vehicle_', '');
    return this.orchestrator.selectVehicle(conversation.id, vehicleType);
  }

  // Handle text input
  if (parsed.text) {
    const lower = parsed.text.toLowerCase();
    if (['keke', 'car', 'bike'].includes(lower)) {
      return this.orchestrator.selectVehicle(conversation.id, lower);
    }
  }

  return {
    state: ConversationState.SELECTING_VEHICLE,
    messages: [{ type: 'text', text: 'Please select a vehicle type from the list.' }],
  };
}

private async handleConfirmation(
  conversation: { id: string },
  parsed: ParsedInboundMessage,
): Promise<BookingResponse> {
  if (!this.orchestrator) return null;

  if (parsed.buttonId === 'confirm_ride' || parsed.text?.toLowerCase().trim() === 'confirm') {
    return this.orchestrator.confirmRide(conversation.id, 'cash');
  }

  if (parsed.buttonId === 'change_pickup') {
    return {
      state: ConversationState.AWAITING_PICKUP,
      messages: [{
        type: 'buttons',
        text: '📍 Share your new pickup location:',
        buttons: [
          { id: 'share_location', title: '📍 Share Location' },
          { id: 'enter_address', title: '✏️ Enter Address' },
        ],
      }],
    };
  }

  if (parsed.buttonId === 'change_dest') {
    return {
      state: ConversationState.AWAITING_DESTINATION,
      messages: [{
        type: 'buttons',
        text: '🏁 Enter your new destination:',
        buttons: [
          { id: 'share_location', title: '📍 Share Location' },
          { id: 'enter_address', title: '✏️ Enter Address' },
        ],
      }],
    };
  }

  return {
    state: ConversationState.CONFIRMING_RIDE,
    messages: [{ type: 'text', text: 'Please confirm your ride or change details.' }],
  };
}

private async handlePaymentSelection(
  conversation: { id: string },
  parsed: ParsedInboundMessage,
): Promise<BookingResponse> {
  if (!this.orchestrator) return null;

  if (parsed.buttonId === 'cash' || parsed.text?.toLowerCase().trim() === 'cash') {
    return this.orchestrator.confirmRide(conversation.id, 'cash');
  }

  if (parsed.buttonId === 'pay_online' || parsed.text?.toLowerCase().trim() === 'card') {
    // Phase 2 — for now, default to cash
    return this.orchestrator.confirmRide(conversation.id, 'cash');
  }

  return {
    state: ConversationState.SELECTING_PAYMENT,
    messages: [{
      type: 'buttons',
      text: '💳 How would you like to pay?',
      buttons: [
        { id: 'cash', title: '💵 Cash' },
        { id: 'pay_online', title: '💳 Pay Online' },
      ],
    }],
  };
}

private async handleActiveTrip(
  conversation: { id: string; activeTripId: string | null },
  parsed: ParsedInboundMessage,
  lang: string,
): Promise<BookingResponse> {
  if (!conversation.activeTripId) {
    return { state: ConversationState.IDLE, messages: [] };
  }

  const trip = await this.tripService.getTrip(conversation.activeTripId);
  if (!trip) {
    return { state: ConversationState.IDLE, messages: [{ type: 'text', text: 'No active trip found.' }] };
  }

  if (parsed.buttonId === 'cancel_trip' || parsed.text?.toLowerCase().trim() === 'cancel') {
    if (this.orchestrator) {
      return this.orchestrator.cancelBooking(conversation.id, 'Passenger cancelled via WhatsApp');
    }
  }

  return this.showTripStatus(trip);
}

private async handleRating(
  conversation: { id: string; activeTripId: string | null },
  parsed: ParsedInboundMessage,
): Promise<BookingResponse> {
  if (!conversation.activeTripId) {
    return { state: ConversationState.IDLE, messages: [] };
  }

  const rating = parseInt(parsed.text || parsed.buttonId || '', 10);
  if (rating >= 1 && rating <= 5) {
    try {
      await this.tripService.rateDriver(conversation.activeTripId, rating);

      await this.prisma.whatsAppConversation.update({
        where: { id: conversation.id },
        data: { activeTripId: null, activeBooking: null },
      });

      return {
        state: ConversationState.BOOKING_COMPLETED,
        messages: [{ type: 'text', text: `⭐ Thank you! You rated your driver ${rating}/5.\n\nType "menu" to book another ride.` }],
      };
    } catch (error) {
      return {
        state: ConversationState.IDLE,
        messages: [{ type: 'text', text: 'Rating submitted. Thank you!' }],
      };
    }
  }

  return {
    state: ConversationState.AWAITING_RATING,
    messages: [{
      type: 'buttons',
      text: '⭐ How was your ride?',
      buttons: [
        { id: '1', title: '1⭐' },
        { id: '2', title: '2⭐' },
        { id: '3', title: '3⭐' },
      ],
    }],
  };
}
```

### 4. Add sendBookingResponse method

**Modify:** `apps/api/src/whatsapp/whatsapp.service.ts`

Add new method:

```typescript
private async sendBookingResponse(
  phoneNumberId: string,
  to: string,
  response: BookingResponse,
  accessToken: string,
): Promise<void> {
  // Update conversation state
  const conversation = await this.prisma.whatsAppConversation.findFirst({
    where: { config: { phoneNumberId }, whatsappPhone: to },
  });

  if (conversation) {
    const updateData: any = { conversationState: response.state };
    if (response.clearBooking) {
      updateData.activeBooking = null;
      updateData.activeTripId = null;
    }
    // Set session expiry (30 minutes from now)
    updateData.sessionExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await this.prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: updateData,
    });
  }

  // Send each message
  for (const msg of response.messages) {
    switch (msg.type) {
      case 'text':
        if (msg.text) await this.sendMessage(phoneNumberId, to, msg.text, accessToken);
        break;
      case 'buttons':
        if (msg.text && msg.buttons) {
          await this.sendButtonsMessage(phoneNumberId, to, msg.text, msg.buttons, accessToken);
        }
        break;
      case 'list':
        if (msg.title && msg.listSections) {
          await this.sendListMessage(
            phoneNumberId, to, msg.title,
            msg.description || '', msg.listButtonText || 'Select',
            msg.listSections, accessToken,
          );
        }
        break;
      case 'location':
        if (msg.location) {
          await this.sendLocationMessage(
            phoneNumberId, to,
            msg.location.lat, msg.location.lng,
            msg.location.name, msg.location.address,
            accessToken,
          );
        }
        break;
      case 'link':
        if (msg.link && msg.text) {
          await this.sendMessage(phoneNumberId, to, `${msg.text}\n\n${msg.link}`, accessToken);
        }
        break;
    }
  }
}
```

### 5. Add helper for menu response

**Modify:** `apps/api/src/whatsapp/whatsapp.service.ts`

```typescript
private getMenuResponse(
  conversation: { id: string; preferredLanguage: string; role: string },
  lang: string,
): BookingResponse {
  const isRegistered = conversation.role === 'passenger' || conversation.role === 'driver';

  if (!isRegistered) {
    return {
      state: ConversationState.IDLE,
      messages: [{
        type: 'buttons',
        text: this.t('greeting_unregistered', lang),
        buttons: [
          { id: 'register_passenger', title: '🚗 I want rides' },
          { id: 'register_driver', title: '🚗 I want to drive' },
          { id: 'help', title: '❓ Help' },
        ],
      }],
    };
  }

  return {
    state: ConversationState.IDLE,
    messages: [{
      type: 'buttons',
      text: this.t('menu', lang),
      buttons: [
        { id: 'book_ride', title: '🚕 Book Ride' },
        { id: 'my_trips', title: '📋 My Trips' },
        { id: 'help', title: '❓ Help' },
      ],
    }],
  };
}
```

### 6. Update handleIdleState to route through orchestrator

**Modify:** `apps/api/src/whatsapp/whatsapp.service.ts`

In `handleIdleState` (line 374), update the `book_ride` case:

```typescript
case 'book_ride':
  if (this.orchestrator && conversation.role === 'passenger') {
    return this.orchestrator.startBooking(conversation.id);
  }
  return this.getBookRideResponse(language);
```

---

## Acceptance Criteria

- [ ] `processIncomingMessage` performs idempotency check before processing
- [ ] `routeMessage` handles global commands (menu, help, cancel, restart) from any state
- [ ] `routeMessage` routes to correct handler based on conversation state
- [ ] Booking flow: IDLE → AWAITING_PICKUP → AWAITING_DESTINATION → SELECTING_VEHICLE → CONFIRMING_RIDE → WAITING_FOR_MATCH → TRIP_ACTIVE → AWAITING_RATING
- [ ] Location messages handled in pickup and destination states
- [ ] Button taps (share_location, enter_address, confirm_ride, etc.) handled correctly
- [ ] List selections (vehicle type) handled correctly
- [ ] `sendBookingResponse` sends appropriate message type (text/buttons/list/location)
- [ ] Conversation state updated after each response
- [ ] Session expiry set to 30 minutes
- [ ] Existing registration flow still works
- [ ] `pnpm build api` compiles without errors

---

## Verification

```bash
cd apps/api
pnpm build
# Test flow:
# 1. Send "Hi" → menu with buttons
# 2. Tap "Book Ride" → AWAITING_PICKUP with location buttons
# 3. Share location → AWAITING_DESTINATION
# 4. Type address → SELECTING_VEHICLE with list
# 5. Select vehicle → CONFIRMING_RIDE with summary
# 6. Tap "Confirm Ride" → trip created, WAITING_FOR_MATCH
```
