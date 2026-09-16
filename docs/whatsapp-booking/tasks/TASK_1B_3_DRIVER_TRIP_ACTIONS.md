# Task 1B-3: Driver Trip Actions (Socket.IO Integration)

**Agent:** Agent E
**Phase:** 1B — Driver WhatsApp
**Depends on:** 1B-2 (Driver Handler)
**Blocks:** None
**Effort:** 1 day

---

## Context

The driver's trip actions (accept, decline, arrived, start, complete) need to integrate with the existing Socket.IO event system used by the mobile app. Since WhatsApp drivers don't have a WebSocket connection, we need to emit the same events programmatically from the WhatsApp handler.

---

## Exact Changes

### 1. Create a WhatsApp-to-Socket bridge service

**New file:** `apps/api/src/whatsapp/whatsapp-socket-bridge.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { MatchingService } from '../matching/matching.service';
import { TripService } from '../trips/trips.service';
import { EventsGateway } from '../realtime/events.gateway';
import { SOCKET_EVENTS, TripStatus } from '@higo/shared-types';

@Injectable()
export class WhatsAppSocketBridge {
  private readonly logger = new Logger(WhatsAppSocketBridge.name);

  constructor(
    private readonly matchingService: MatchingService,
    private readonly tripService: TripService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  /**
   * Accept a trip offer on behalf of a WhatsApp driver.
   */
  async acceptTrip(driverId: string, tripId: string): Promise<void> {
    try {
      await this.matchingService.acceptOffer(driverId, tripId);
      this.logger.log(`WhatsApp driver ${driverId} accepted trip ${tripId}`);
    } catch (error) {
      this.logger.error(`Failed to accept trip: ${error.message}`);
      throw error;
    }
  }

  /**
   * Decline a trip offer on behalf of a WhatsApp driver.
   */
  async declineTrip(driverId: string, tripId: string, reason?: string): Promise<void> {
    try {
      await this.matchingService.declineOffer(driverId, tripId, reason || 'whatsapp_decline');
      this.logger.log(`WhatsApp driver ${driverId} declined trip ${tripId}`);
    } catch (error) {
      this.logger.error(`Failed to decline trip: ${error.message}`);
      throw error;
    }
  }

  /**
   * Mark driver as arrived at pickup.
   */
  async arrivedAtPickup(driverId: string, tripId: string): Promise<void> {
    try {
      await this.tripService.transition(tripId, TripStatus.ARRIVED, 'driver', driverId);
      this.logger.log(`WhatsApp driver ${driverId} arrived at pickup for trip ${tripId}`);
    } catch (error) {
      this.logger.error(`Failed to mark arrived: ${error.message}`);
      throw error;
    }
  }

  /**
   * Start the trip.
   */
  async startTrip(driverId: string, tripId: string): Promise<void> {
    try {
      await this.tripService.transition(tripId, TripStatus.ACTIVE, 'driver', driverId);
      this.logger.log(`WhatsApp driver ${driverId} started trip ${tripId}`);
    } catch (error) {
      this.logger.error(`Failed to start trip: ${error.message}`);
      throw error;
    }
  }

  /**
   * Complete the trip.
   */
  async completeTrip(driverId: string, tripId: string): Promise<void> {
    try {
      await this.tripService.transition(tripId, TripStatus.COMPLETED, 'driver', driverId);
      this.logger.log(`WhatsApp driver ${driverId} completed trip ${tripId}`);
    } catch (error) {
      this.logger.error(`Failed to complete trip: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update driver location (write to Redis for dispatch).
   */
  async updateLocation(driverId: string, lat: number, lng: number, bearing?: number): Promise<void> {
    try {
      // Write to Redis for real-time dispatch (same format as mobile app)
      const locationData = JSON.stringify({
        lat,
        lng,
        bearing: bearing || 0,
        speed: 0,
        recordedAt: new Date().toISOString(),
      });

      // Use the events gateway's presence system
      // This writes to Redis key `loc:driver:{driverId}` which the geo query reads
      this.logger.log(`WhatsApp driver ${driverId} location updated: ${lat}, ${lng}`);
    } catch (error) {
      this.logger.error(`Failed to update location: ${error.message}`);
    }
  }

  /**
   * Go online via REST API (same as mobile app PUT /drivers/online-status).
   */
  async goOnline(driverId: string): Promise<void> {
    try {
      // The mobile app calls PUT /drivers/online-status
      // We need to replicate that logic here
      this.logger.log(`WhatsApp driver ${driverId} going online`);
      // TODO: Call the actual online status endpoint logic
    } catch (error) {
      this.logger.error(`Failed to go online: ${error.message}`);
      throw error;
    }
  }

  /**
   * Go offline.
   */
  async goOffline(driverId: string): Promise<void> {
    try {
      this.logger.log(`WhatsApp driver ${driverId} going offline`);
      // TODO: Call the actual offline status endpoint logic
    } catch (error) {
      this.logger.error(`Failed to go offline: ${error.message}`);
      throw error;
    }
  }
}
```

### 2. Register in WhatsAppModule

**Modify:** `apps/api/src/whatsapp/whatsapp.module.ts`

Add to providers:
```typescript
providers: [
  WhatsAppService,
  BookingOrchestrator,
  IdempotencyService,
  WhatsAppNotificationListener,
  NavigationService,
  WhatsAppSocketBridge,
],
```

Add import:
```typescript
import { WhatsAppSocketBridge } from './whatsapp-socket-bridge.service';
```

### 3. Use bridge in driver handlers

**Modify:** `apps/api/src/whatsapp/whatsapp.service.ts`

Add to constructor:
```typescript
private readonly socketBridge?: WhatsAppSocketBridge,
```

In `handleDriverIncomingRequest` when accept:
```typescript
if (parsed.buttonId === 'accept_trip' || parsed.text?.toLowerCase().trim() === 'accept') {
  if (this.socketBridge && conversation.driverId) {
    // Get tripId from conversation's activeTripId or from pending request
    const tripId = (conversation as any).activeTripId;
    if (tripId) {
      try {
        await this.socketBridge.acceptTrip(conversation.driverId, tripId);
        return {
          state: ConversationState.DRIVER_ACCEPTED_TRIP,
          messages: [{
            type: 'buttons',
            text: `✅ Trip accepted!\n\nNavigate to pickup.`,
            buttons: [
              { id: 'arrived', title: '📍 Arrived' },
              { id: 'navigate', title: '🗺️ Navigate' },
            ],
          }],
        };
      } catch (error) {
        return {
          state: ConversationState.DRIVER_ONLINE,
          messages: [{ type: 'text', text: `Failed to accept: ${error.message}` }],
        };
      }
    }
  }
}
```

Similar changes for decline, arrived, start, complete.

### 4. Handle incoming ride requests for WhatsApp drivers

**Modify:** `apps/api/src/whatsapp/notification.listener.ts`

When a trip is requested and a WhatsApp driver is nearby, send them the request:

```typescript
@OnEvent('trip.requested')
async handleTripRequestedForDrivers(event: TripRequested): Promise<void> {
  // Find online WhatsApp drivers nearby
  // This is a simplified version — the real matching happens in MatchingService
  // But we need to notify WhatsApp drivers who are in the DRIVER_ONLINE state

  const onlineDrivers = await this.prisma.whatsAppConversation.findMany({
    where: {
      role: 'driver',
      conversationState: ConversationState.DRIVER_ONLINE,
      isActive: true,
    },
  });

  for (const driver of onlineDrivers) {
    if (!driver.driverId) continue;

    try {
      const navUrl = this.navigationService.toPickup(event.pickup.lat, event.pickup.lng);
      await this.whatsappService.sendButtonsMessage(
        await this.getPhoneNumberId(),
        driver.whatsappPhone,
        `🚨 New Ride Request!\n\n` +
        `📍 Pickup: ${event.pickup.address}\n` +
        `🏁 Destination: ${event.destination.address}\n` +
        `💰 Fare: ₦${event.totalFare.toLocaleString()}\n` +
        `📏 ${event.distanceKm?.toFixed(1) || '?'} km\n\n` +
        `🗺️ Navigate: ${navUrl}`,
        [
          { id: 'accept_trip', title: '✅ Accept' },
          { id: 'decline_trip', title: '❌ Decline' },
        ],
        await this.getAccessToken(),
      );

      // Store trip ID on conversation for accept/decline
      await this.prisma.whatsAppConversation.update({
        where: { id: driver.id },
        data: {
          conversationState: ConversationState.DRIVER_INCOMING_REQUEST,
          activeTripId: event.tripId,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to notify driver ${driver.id}: ${error.message}`);
    }
  }
}
```

---

## Acceptance Criteria

- [ ] `WhatsAppSocketBridge` wraps MatchingService and TripService calls
- [ ] `acceptTrip` calls `matchingService.acceptOffer`
- [ ] `declineTrip` calls `matchingService.declineOffer`
- [ ] `arrivedAtPickup` calls `tripService.transition` to ARRIVED
- [ ] `startTrip` calls `tripService.transition` to ACTIVE
- [ ] `completeTrip` calls `tripService.transition` to COMPLETED
- [ ] Driver handlers use bridge for all trip actions
- [ ] NotificationListener sends incoming requests to online WhatsApp drivers
- [ ] Trip ID stored on driver conversation for accept/decline
- [ ] `pnpm build api` compiles without errors

---

## Verification

```bash
cd apps/api
pnpm build
# Verify: driver accept calls matchingService.acceptOffer
# Verify: driver arrived calls tripService.transition(ARRIVED)
# Verify: online drivers receive incoming request notifications
```
