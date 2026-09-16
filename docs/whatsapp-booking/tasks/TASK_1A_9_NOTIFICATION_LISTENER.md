# Task 1A-9: WhatsApp Notification Listener

**Agent:** Agent A
**Phase:** 1A — Foundation
**Depends on:** 1A-1 (Event Bus), 1A-7 (Module Wiring)
**Blocks:** 1A-8 (needs to be in place for passenger flow to receive updates)
**Effort:** 1 day

---

## Context

When trip events happen (driver matched, arrived, started, completed), the WhatsApp channel needs to notify the passenger. This is done via a listener that subscribes to domain events and sends WhatsApp messages — completely decoupled from TripService.

---

## Exact Changes

### 1. Create the notification listener

**New file:** `apps/api/src/whatsapp/notification.listener.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from './whatsapp.service';
import {
  TripRequested,
  DriverMatched,
  DriverArrived,
  TripStarted,
  TripCompleted,
  TripCancelled,
  NoDriversAvailable,
} from '../trips/trip.events';
import { ConversationState } from './whatsapp.types';

@Injectable()
export class WhatsAppNotificationListener {
  private readonly logger = new Logger(WhatsAppNotificationListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappService: WhatsAppService,
  ) {}

  @OnEvent('trip.requested')
  async handleTripRequested(event: TripRequested): Promise<void> {
    if (event.source !== 'whatsapp') return;

    const conversation = await this.findConversationByUserId(event.passengerId);
    if (!conversation) return;

    try {
      await this.whatsappService.sendMessage(
        await this.getPhoneNumberId(),
        conversation.whatsappPhone,
        `🔍 Searching for a driver...\n\n📍 Pickup: ${event.pickup.address}\n🏁 Destination: ${event.destination.address}\n💰 Fare: ₦${event.totalFare.toLocaleString()}`,
        await this.getAccessToken(),
      );

      await this.prisma.whatsAppConversation.update({
        where: { id: conversation.id },
        data: {
          activeTripId: event.tripId,
          conversationState: ConversationState.WAITING_FOR_MATCH,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to send trip.requested notification: ${error.message}`);
    }
  }

  @OnEvent('driver.matched')
  async handleDriverMatched(event: DriverMatched): Promise<void> {
    // Notify passenger
    const passengerConversation = await this.findConversationByTripId(event.tripId, 'passenger');
    if (passengerConversation) {
      try {
        const navUrl = `https://www.google.com/maps/dir/?api=1&destination=&travelmode=driving`;
        await this.whatsappService.sendMessage(
          await this.getPhoneNumberId(),
          passengerConversation.whatsappPhone,
          `✅ Driver found!\n\n` +
          `👤 ${event.driverName}\n` +
          `🚗 ${event.driverVehicle || 'Vehicle'}\n` +
          `🔢 ${event.driverPlate || 'N/A'}\n` +
          `⏱️ ETA: ~${event.etaMinutes || '?'} min\n\n` +
          `Your driver is on the way!`,
          await this.getAccessToken(),
        );

        await this.prisma.whatsAppConversation.update({
          where: { id: passengerConversation.id },
          data: { conversationState: ConversationState.TRIP_ACTIVE },
        });
      } catch (error) {
        this.logger.error(`Failed to send driver.matched to passenger: ${error.message}`);
      }
    }

    // Notify driver (if they have WhatsApp)
    const driverConversation = await this.findConversationByDriverId(event.driverId);
    if (driverConversation) {
      try {
        await this.whatsappService.sendMessage(
          await this.getPhoneNumberId(),
          driverConversation.whatsappPhone,
          `📋 New ride assigned!\n\n` +
          `Pickup: (check your app for details)\n` +
          `Fare: ₦${event.etaMinutes || '?'}`,
          await this.getAccessToken(),
        );
      } catch (error) {
        this.logger.error(`Failed to send driver.matched to driver: ${error.message}`);
      }
    }
  }

  @OnEvent('driver.arrived')
  async handleDriverArrived(event: DriverArrived): Promise<void> {
    const conversation = await this.findConversationByTripId(event.tripId, 'passenger');
    if (!conversation) return;

    try {
      await this.whatsappService.sendMessage(
        await this.getPhoneNumberId(),
        conversation.whatsappPhone,
        `📍 Your driver has arrived at the pickup!\n\nPlease look for your driver.`,
        await this.getAccessToken(),
      );
    } catch (error) {
      this.logger.error(`Failed to send driver.arrived: ${error.message}`);
    }
  }

  @OnEvent('trip.started')
  async handleTripStarted(event: TripStarted): Promise<void> {
    const conversation = await this.findConversationByTripId(event.tripId, 'passenger');
    if (!conversation) return;

    try {
      await this.whatsappService.sendMessage(
        await this.getPhoneNumberId(),
        conversation.whatsappPhone,
        `🚗 Trip started!\n\nHave a safe journey! 🛣️`,
        await this.getAccessToken(),
      );
    } catch (error) {
      this.logger.error(`Failed to send trip.started: ${error.message}`);
    }
  }

  @OnEvent('trip.completed')
  async handleTripCompleted(event: TripCompleted): Promise<void> {
    const conversation = await this.findConversationByTripId(event.tripId, 'passenger');
    if (!conversation) return;

    try {
      await this.whatsappService.sendMessage(
        await this.getPhoneNumberId(),
        conversation.whatsappPhone,
        `✅ Trip completed!\n\n💰 Total fare: ₦${event.totalFare.toLocaleString()}\n💳 Payment: ${event.paymentMethod}\n\n` +
        `⭐ How was your ride? Rate 1-5:`,
        await this.getAccessToken(),
      );

      await this.prisma.whatsAppConversation.update({
        where: { id: conversation.id },
        data: {
          conversationState: ConversationState.AWAITING_RATING,
          activeTripId: null,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to send trip.completed: ${error.message}`);
    }
  }

  @OnEvent('trip.cancelled')
  async handleTripCancelled(event: TripCancelled): Promise<void> {
    const conversation = await this.findConversationByTripId(event.tripId, 'passenger');
    if (!conversation) return;

    try {
      const reason = event.cancelledBy === 'system'
        ? 'The trip was cancelled automatically.'
        : event.cancelledBy === 'driver'
          ? 'Your driver cancelled the trip.'
          : 'Trip cancelled.';

      await this.whatsappService.sendMessage(
        await this.getPhoneNumberId(),
        conversation.whatsappPhone,
        `❌ ${reason}\n\nType "menu" to book another ride.`,
        await this.getAccessToken(),
      );

      await this.prisma.whatsAppConversation.update({
        where: { id: conversation.id },
        data: {
          conversationState: ConversationState.IDLE,
          activeTripId: null,
          activeBooking: null,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to send trip.cancelled: ${error.message}`);
    }
  }

  @OnEvent('trip.no_drivers_available')
  async handleNoDriversAvailable(event: NoDriversAvailable): Promise<void> {
    const conversation = await this.findConversationByTripId(event.tripId, 'passenger');
    if (!conversation) return;

    try {
      const { sendButtonsMessage } = this.whatsappService;
      await sendButtonsMessage(
        await this.getPhoneNumberId(),
        conversation.whatsappPhone,
        `😔 No drivers available right now.`,
        [
          { id: 'try_again', title: '🔄 Try Again' },
          { id: 'book_ride', title: '🚕 New Ride' },
          { id: 'cancel', title: '❌ Cancel' },
        ],
        await this.getAccessToken(),
      );

      await this.prisma.whatsAppConversation.update({
        where: { id: conversation.id },
        data: {
          conversationState: ConversationState.IDLE,
          activeTripId: null,
          activeBooking: null,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to send no_drivers_available: ${error.message}`);
    }
  }

  // ─── HELPER METHODS ──────────────────────────────────────────────

  private async findConversationByUserId(userId: string) {
    return this.prisma.whatsAppConversation.findFirst({
      where: { userId, isActive: true },
    });
  }

  private async findConversationByDriverId(driverId: string) {
    return this.prisma.whatsAppConversation.findFirst({
      where: { driverId, isActive: true },
    });
  }

  private async findConversationByTripId(tripId: string, role: 'passenger' | 'driver') {
    const field = role === 'passenger' ? 'activeTripId' : 'activeTripId';
    return this.prisma.whatsAppConversation.findFirst({
      where: { [field]: tripId, isActive: true },
    });
  }

  private async getPhoneNumberId(): Promise<string> {
    const config = await this.prisma.whatsAppConfig.findFirst({ where: { isActive: true } });
    return config?.phoneNumberId || '';
  }

  private async getAccessToken(): Promise<string> {
    const config = await this.prisma.whatsAppConfig.findFirst({ where: { isActive: true } });
    return config?.accessToken || '';
  }
}
```

### 2. Emit events from TripService

**Modify:** `apps/api/src/trips/trips.service.ts`

Add to imports at top:
```typescript
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TripRequested, DriverMatched, DriverArrived, TripStarted, TripCompleted, TripCancelled, NoDriversAvailable } from './trip.events';
```

Add to constructor:
```typescript
private readonly eventEmitter: EventEmitter2,
```

In `requestTrip()` after line 1238 (after trip is created):
```typescript
this.eventEmitter.emit('trip.requested', new TripRequested(
  tripId,
  passengerId,
  dto.pickup,
  dto.destination,
  dto.vehicleType,
  estimate.totalFare,
  distanceKm,
  durationMin,
  dto.paymentMethod,
  source,
));
```

In `transition()` after each successful status change, emit the corresponding event:
```typescript
// After MATCHED (line 1441):
// Emit after driver info is available — done in MatchingService.acceptOffer

// After ACTIVE (line 1446):
if (updateResult > 0) {
  this.eventEmitter.emit('trip.started', new TripStarted(tripId, trip.driverId));
}

// After COMPLETED (line 1454):
if (updateResult > 0) {
  this.eventEmitter.emit('trip.completed', new TripCompleted(
    tripId, trip.driverId, trip.passengerId, trip.totalFare, trip.paymentMethod,
  ));
}

// After CANCELLED (line 1472):
if (updateResult > 0) {
  this.eventEmitter.emit('trip.cancelled', new TripCancelled(
    tripId, trip.passengerId, trip.driverId, actor as any, cancelReason,
  ));
}
```

In `cancelTrip()` after line 1287:
```typescript
// Trip cancelled event is emitted by transition()
```

### 3. Emit DriverMatched from MatchingService

**Modify:** `apps/api/src/matching/matching.service.ts`

Add to imports:
```typescript
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DriverMatched } from '../trips/trip.events';
```

Add to constructor:
```typescript
private readonly eventEmitter: EventEmitter2,
```

In `acceptOffer()` after line 515 (after transition to MATCHED succeeds):
```typescript
const trip = await this.tripService.getTrip(tripId);
const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
if (driver) {
  this.eventEmitter.emit('driver.matched', new DriverMatched(
    tripId,
    driverId,
    driver.name,
    driver.phone,
    `${driver.vehicleColor || ''} ${driver.vehicleModel || ''}`.trim() || null,
    driver.vehiclePlate,
    null, // ETA — could be computed
  ));
}
```

### 4. Emit DriverArrived from EventsGateway

**Modify:** `apps/api/src/realtime/events.gateway.ts`

Add to imports:
```typescript
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DriverArrived } from '../trips/trip.events';
```

Add to constructor:
```typescript
private readonly eventEmitter: EventEmitter2,
```

In `handleArrivedAtPickup` after the transition succeeds (around line 458):
```typescript
this.eventEmitter.emit('driver.arrived', new DriverArrived(tripId, driverId));
```

### 5. Emit NoDriversAvailable from MatchingService

**Modify:** `apps/api/src/matching/matching.service.ts`

Add to imports:
```typescript
import { NoDriversAvailable } from '../trips/trip.events';
```

In `dispatch()` when no candidates are found (around line 143):
```typescript
this.eventEmitter.emit('trip.no_drivers_available', new NoDriversAvailable(tripId, trip.passengerId));
```

---

## Acceptance Criteria

- [ ] `WhatsAppNotificationListener` created with handlers for all 7 events
- [ ] Each handler finds the correct WhatsApp conversation by userId/driverId/tripId
- [ ] TripService emits `TripRequested` in `requestTrip()`
- [ ] TripService emits `TripStarted`, `TripCompleted`, `TripCancelled` in `transition()`
- [ ] MatchingService emits `DriverMatched` in `acceptOffer()`
- [ ] EventsGateway emits `DriverArrived` in `handleArrivedAtPickup`
- [ ] MatchingService emits `NoDriversAvailable` when dispatch finds no candidates
- [ ] Notifications only sent for WhatsApp-sourced trips (check `event.source`)
- [ ] Google Maps navigation URLs included in driver match messages
- [ ] Conversation state updated appropriately after each notification
- [ ] `pnpm build api` compiles without errors

---

## Verification

```bash
cd apps/api
pnpm build
# Verify: all event emissions compile
# Verify: listener subscribes to correct event names
# Verify: notification messages are sent for WhatsApp trips
```
