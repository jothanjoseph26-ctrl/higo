# Task 1B-2: Driver Inbound Handler

**Agent:** Agent D
**Phase:** 1B — Driver WhatsApp
**Depends on:** 1B-1 (Driver States)
**Blocks:** 1B-3 (Driver Trip Actions)
**Effort:** 1 day

---

## Context

When a driver sends a message on WhatsApp, the system needs to route it based on the driver's current state: idle, online, incoming request, active trip, etc. This task creates the driver-side message routing and handler methods.

---

## Exact Changes

### 1. Add driver routing to message router

**Modify:** `apps/api/src/whatsapp/whatsapp.service.ts`

In `routeMessage`, add driver state handling before the passenger switch:

```typescript
// Driver flow — route by conversation state
if (conversation.role === 'driver') {
  return this.routeDriverMessage(conversation, parsed, lang);
}
```

### 2. Add driver routing method

**Modify:** `apps/api/src/whatsapp/whatsapp.service.ts`

Add new method:

```typescript
private async routeDriverMessage(
  conversation: {
    id: string;
    conversationState: string;
    preferredLanguage: string;
    driverId: string | null;
  },
  parsed: ParsedInboundMessage,
  lang: string,
): Promise<BookingResponse | null> {
  const state = conversation.conversationState as ConversationState;

  // Global commands
  if (parsed.text) {
    const lower = parsed.text.toLowerCase().trim();
    if (['menu', 'start', 'hi', 'hello'].includes(lower)) {
      return this.getDriverMenuResponse(conversation, lang);
    }
  }

  switch (state) {
    case ConversationState.DRIVER_IDLE:
      return this.handleDriverIdle(conversation, parsed, lang);

    case ConversationState.DRIVER_ONLINE:
      return this.handleDriverOnline(conversation, parsed, lang);

    case ConversationState.DRIVER_INCOMING_REQUEST:
      return this.handleDriverIncomingRequest(conversation, parsed, lang);

    case ConversationState.DRIVER_ACCEPTED_TRIP:
    case ConversationState.DRIVER_NAVIGATING_TO_PICKUP:
      return this.handleDriverNavigating(conversation, parsed, lang);

    case ConversationState.DRIVER_ARRIVED:
      return this.handleDriverArrived(conversation, parsed, lang);

    case ConversationState.DRIVER_TRIP_IN_PROGRESS:
      return this.handleDriverTripInProgress(conversation, parsed, lang);

    case ConversationState.DRIVER_AWAITING_PASSENGER_RATING:
      return this.handleDriverRating(conversation, parsed, lang);

    default:
      return this.getDriverMenuResponse(conversation, lang);
  }
}
```

### 3. Add driver handler methods

**Modify:** `apps/api/src/whatsapp/whatsapp.service.ts`

Add methods:

```typescript
private getDriverMenuResponse(
  conversation: { id: string; preferredLanguage: string },
  lang: string,
): BookingResponse {
  return {
    state: ConversationState.DRIVER_IDLE,
    messages: [{
      type: 'buttons',
      text: this.t('driver_menu', lang),
      buttons: [
        { id: 'go_online', title: '🟢 Go Online' },
        { id: 'my_earnings', title: '💰 Earnings' },
        { id: 'help', title: '❓ Help' },
      ],
    }],
  };
}

private async handleDriverIdle(
  conversation: { id: string; driverId: string | null },
  parsed: ParsedInboundMessage,
  lang: string,
): Promise<BookingResponse> {
  if (parsed.buttonId === 'go_online' || parsed.text?.toLowerCase().trim() === 'online') {
    if (!conversation.driverId) {
      return {
        state: ConversationState.DRIVER_IDLE,
        messages: [{ type: 'text', text: 'Driver profile not found. Please register first.' }],
      };
    }

    // Go online via API (same as mobile app)
    try {
      // TODO: Call driver online status API
      // await this.driversService.goOnline(conversation.driverId);

      await this.prisma.whatsAppConversation.update({
        where: { id: conversation.id },
        data: { conversationState: ConversationState.DRIVER_ONLINE },
      });

      return {
        state: ConversationState.DRIVER_ONLINE,
        messages: [{
          type: 'buttons',
          text: `🟢 You're online!\n\nYou'll receive ride requests here.\n\nTap "Go Offline" when you're done.`,
          buttons: [
            { id: 'go_offline', title: '🔴 Go Offline' },
            { id: 'share_location', title: '📍 Share Location' },
          ],
        }],
      };
    } catch (error) {
      return {
        state: ConversationState.DRIVER_IDLE,
        messages: [{ type: 'text', text: `Failed to go online: ${error.message}` }],
      };
    }
  }

  return this.getDriverMenuResponse(conversation, lang);
}

private async handleDriverOnline(
  conversation: { id: string; driverId: string | null },
  parsed: ParsedInboundMessage,
  lang: string,
): Promise<BookingResponse> {
  if (parsed.buttonId === 'go_offline' || parsed.text?.toLowerCase().trim() === 'offline') {
    try {
      // TODO: Call driver offline status API
      // await this.driversService.goOffline(conversation.driverId);

      await this.prisma.whatsAppConversation.update({
        where: { id: conversation.id },
        data: { conversationState: ConversationState.DRIVER_IDLE },
      });

      return {
        state: ConversationState.DRIVER_IDLE,
        messages: [{ type: 'text', text: `🔴 You're offline.\n\nType "online" to go back online.` }],
      };
    } catch (error) {
      return {
        state: ConversationState.DRIVER_ONLINE,
        messages: [{ type: 'text', text: `Failed to go offline: ${error.message}` }],
      };
    }
  }

  if (parsed.type === 'location' && parsed.location) {
    // Driver sharing location while online — update Redis for dispatch
    // TODO: Update driver location in Redis GEOADD
    return {
      state: ConversationState.DRIVER_ONLINE,
      messages: [{ type: 'text', text: `📍 Location updated. Waiting for ride requests...` }],
    };
  }

  return {
    state: ConversationState.DRIVER_ONLINE,
    messages: [{
      type: 'buttons',
      text: `🟢 You're online. Waiting for ride requests...\n\nShare your location to update your position.`,
      buttons: [
        { id: 'go_offline', title: '🔴 Go Offline' },
        { id: 'share_location', title: '📍 Share Location' },
      ],
    }],
  };
}

private async handleDriverIncomingRequest(
  conversation: { id: string; driverId: string | null },
  parsed: ParsedInboundMessage,
  lang: string,
): Promise<BookingResponse> {
  if (parsed.buttonId === 'accept_trip' || parsed.text?.toLowerCase().trim() === 'accept') {
    // TODO: Call matchingService.acceptOffer(driverId, tripId)
    return {
      state: ConversationState.DRIVER_ACCEPTED_TRIP,
      messages: [{
        type: 'buttons',
        text: `✅ Trip accepted!\n\nNavigate to pickup location.`,
        buttons: [
          { id: 'arrived', title: '📍 Arrived at Pickup' },
          { id: 'navigate', title: '🗺️ Open Navigation' },
        ],
      }],
    };
  }

  if (parsed.buttonId === 'decline_trip' || parsed.text?.toLowerCase().trim() === 'decline') {
    // TODO: Call matchingService.declineOffer(driverId, tripId)
    await this.prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: { conversationState: ConversationState.DRIVER_ONLINE },
    });

    return {
      state: ConversationState.DRIVER_ONLINE,
      messages: [{ type: 'text', text: `❌ Declined. Waiting for next request...` }],
    };
  }

  return {
    state: ConversationState.DRIVER_INCOMING_REQUEST,
    messages: [{
      type: 'buttons',
      text: `⚠️ Incoming ride request!\n\n(Full details will be shown here)`,
      buttons: [
        { id: 'accept_trip', title: '✅ Accept' },
        { id: 'decline_trip', title: '❌ Decline' },
      ],
    }],
  };
}

private async handleDriverNavigating(
  conversation: { id: string; driverId: string | null },
  parsed: ParsedInboundMessage,
  lang: string,
): Promise<BookingResponse> {
  if (parsed.buttonId === 'arrived' || parsed.text?.toLowerCase().trim() === 'arrived') {
    // TODO: Emit driver:arrived_at_pickup via socket or API
    return {
      state: ConversationState.DRIVER_ARRIVED,
      messages: [{
        type: 'buttons',
        text: `📍 You've arrived at pickup!\n\nWait for the passenger, then start the trip.`,
        buttons: [
          { id: 'start_trip', title: '▶️ Start Trip' },
          { id: 'call_passenger', title: '📞 Call Passenger' },
        ],
      }],
    };
  }

  if (parsed.buttonId === 'navigate' || parsed.text?.toLowerCase().trim() === 'navigate') {
    // TODO: Send Google Maps navigation link
    return {
      state: ConversationState.DRIVER_ACCEPTED_TRIP,
      messages: [{ type: 'text', text: `🗺️ Opening navigation...\n\n(Driver should tap the navigation link in the original request message)` }],
    };
  }

  return {
    state: ConversationState.DRIVER_ACCEPTED_TRIP,
    messages: [{
      type: 'buttons',
      text: `🚗 Heading to pickup...`,
      buttons: [
        { id: 'arrived', title: '📍 Arrived at Pickup' },
        { id: 'navigate', title: '🗺️ Open Navigation' },
      ],
    }],
  };
}

private async handleDriverArrived(
  conversation: { id: string; driverId: string | null },
  parsed: ParsedInboundMessage,
  lang: string,
): Promise<BookingResponse> {
  if (parsed.buttonId === 'start_trip' || parsed.text?.toLowerCase().trim() === 'start') {
    // TODO: Emit driver:trip_started via socket or API
    return {
      state: ConversationState.DRIVER_TRIP_IN_PROGRESS,
      messages: [{
        type: 'buttons',
        text: `▶️ Trip started!\n\nNavigate to the destination.`,
        buttons: [
          { id: 'complete_trip', title: '✅ Complete Trip' },
          { id: 'navigate', title: '🗺️ Open Navigation' },
        ],
      }],
    };
  }

  return {
    state: ConversationState.DRIVER_ARRIVED,
    messages: [{
      type: 'buttons',
      text: `📍 Waiting for passenger at pickup...`,
      buttons: [
        { id: 'start_trip', title: '▶️ Start Trip' },
        { id: 'call_passenger', title: '📞 Call Passenger' },
      ],
    }],
  };
}

private async handleDriverTripInProgress(
  conversation: { id: string; driverId: string | null },
  parsed: ParsedInboundMessage,
  lang: string,
): Promise<BookingResponse> {
  if (parsed.buttonId === 'complete_trip' || parsed.text?.toLowerCase().trim() === 'complete') {
    // TODO: Emit driver:trip_completed via socket or API
    return {
      state: ConversationState.DRIVER_AWAITING_PASSENGER_RATING,
      messages: [{ type: 'text', text: `✅ Trip completed!\n\nYou'll receive the fare details shortly.` }],
    };
  }

  return {
    state: ConversationState.DRIVER_TRIP_IN_PROGRESS,
    messages: [{
      type: 'buttons',
      text: `🛣️ Trip in progress...`,
      buttons: [
        { id: 'complete_trip', title: '✅ Complete Trip' },
        { id: 'navigate', title: '🗺️ Open Navigation' },
      ],
    }],
  };
}

private async handleDriverRating(
  conversation: { id: string; driverId: string | null },
  parsed: ParsedInboundMessage,
  lang: string,
): Promise<BookingResponse> {
  // Driver can skip rating
  if (parsed.buttonId === 'skip' || parsed.text?.toLowerCase().trim() === 'skip') {
    await this.prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: { conversationState: ConversationState.DRIVER_ONLINE },
    });

    return {
      state: ConversationState.DRIVER_ONLINE,
      messages: [{ type: 'text', text: `Ready for the next ride!\n\nType "online" to go back online.` }],
    };
  }

  return {
    state: ConversationState.DRIVER_AWAITING_PASSENGER_RATING,
    messages: [{
      type: 'buttons',
      text: `⭐ Rate your passenger (optional):`,
      buttons: [
        { id: '5', title: '5⭐' },
        { id: '4', title: '4⭐' },
        { id: 'skip', title: 'Skip' },
      ],
    }],
  };
}
```

### 4. Add driver menu translation

**Modify:** `apps/api/src/whatsapp/whatsapp.service.ts`

Add to `RESPONSE_TEMPLATES`:
```typescript
driver_menu: {
  en: 'HiGO Driver Menu 🚗\n\nWhat would you like to do?',
  ha: 'HiGO Driver Menu 🚗\n\nMe kake so a yi?',
  yo: 'HiGO Driver Menu 🚗\n\nKí ni o fẹ́ ṣe?',
  ig: 'HiGO Driver Menu 🚗\n\nKedu i hụ na-eme?',
  pcm: 'HiGO Driver Menu 🚗\n\nWetin you wan do?',
},
```

---

## Acceptance Criteria

- [ ] `routeDriverMessage` routes based on driver conversation state
- [ ] `handleDriverIdle` handles go_online button/keyword
- [ ] `handleDriverOnline` handles go_offline and location sharing
- [ ] `handleDriverIncomingRequest` handles accept/decline
- [ ] `handleDriverNavigating` handles arrived_at_pickup
- [ ] `handleDriverArrived` handles start_trip
- [ ] `handleDriverTripInProgress` handles complete_trip
- [ ] `handleDriverRating` handles skip
- [ ] All handlers return `BookingResponse` (never send WhatsApp directly)
- [ ] Driver menu response with appropriate buttons
- [ ] `pnpm build api` compiles without errors

---

## Verification

```bash
cd apps/api
pnpm build
# Verify: driver flow works through all states
# Verify: accept/decline buttons work
# Verify: arrived/start/complete flow works
```
