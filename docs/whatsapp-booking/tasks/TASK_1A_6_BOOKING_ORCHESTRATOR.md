# Task 1A-6: Booking Orchestrator

**Agent:** Agent C
**Phase:** 1A — Foundation
**Depends on:** 1A-2 (Schema), 1A-3 (Interactive Messages), 1A-5 (FSM)
**Blocks:** 1A-8 (Passenger Flow)
**Effort:** 1.5 days

---

## Context

The Booking Orchestrator is the channel-agnostic layer that handles all booking business logic. The WhatsApp service is a thin adapter that translates inbound messages into Orchestrator commands and Orchestrator responses into WhatsApp messages. This separation lets you add USSD or SMS later without re-deriving booking logic.

---

## Exact Changes

### 1. Define ActiveBooking interface

**Modify:** `apps/api/src/whatsapp/whatsapp.types.ts`

Add at the end:
```typescript
export interface ActiveBooking {
  pickup?: { lat: number; lng: number; address: string };
  destination?: { lat: number; lng: number; address: string };
  vehicleType?: string;
  fareEstimate?: {
    baseFare: number;
    distanceFare: number;
    timeFare: number;
    rawFare: number;
    totalFare: number;
    distanceKm: number;
    durationMin: number;
    surgeMultiplier: number;
  };
  paymentMethod?: string;
  promoCode?: string;
  tripId?: string;
  startedAt?: string;
}

export interface BookingResponse {
  state: ConversationState;
  messages: BookingMessage[];
  clearBooking?: boolean;
}

export interface BookingMessage {
  type: 'text' | 'buttons' | 'list' | 'location' | 'link';
  text?: string;
  buttons?: WhatsAppButton[];
  listSections?: WhatsAppListSection[];
  listButtonText?: string;
  location?: { lat: number; lng: number; name: string; address: string };
  link?: string;
}
```

### 2. Create BookingOrchestrator

**New file:** `apps/api/src/whatsapp/booking-orchestrator.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { TripService } from '../trips/trips.service';
import { PricingService } from '../pricing/pricing.service';
import { MatchingService } from '../matching/matching.service';
import { MapsService } from '../maps/maps.service';
import { ConversationFSM, ConversationEvent } from './conversation.fsm';
import {
  ConversationState,
  ActiveBooking,
  BookingResponse,
  BookingMessage,
} from './whatsapp.types';
import { TripSource, VehicleType, PaymentMethod } from '@higo/shared-types';

@Injectable()
export class BookingOrchestrator {
  private readonly logger = new Logger(BookingOrchestrator.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tripService: TripService,
    private readonly pricingService: PricingService,
    private readonly matchingService: MatchingService,
    private readonly mapsService: MapsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Get or create an active booking from conversation's onboardingData.
   */
  private getBooking(conversation: { activeBooking: unknown }): ActiveBooking {
    return (conversation.activeBooking as ActiveBooking) || {};
  }

  /**
   * Persist booking data to conversation.
   */
  private async saveBooking(conversationId: string, booking: ActiveBooking): Promise<void> {
    await this.prisma.whatsAppConversation.update({
      where: { id: conversationId },
      data: { activeBooking: booking as any },
    });
  }

  /**
   * Clear booking data from conversation.
   */
  private async clearBooking(conversationId: string): Promise<void> {
    await this.prisma.whatsAppConversation.update({
      where: { id: conversationId },
      data: { activeBooking: null, activeTripId: null },
    });
  }

  // ─── BOOKING FLOW METHODS ─────────────────────────────────────────

  async startBooking(conversationId: string): Promise<BookingResponse> {
    const conversation = await this.prisma.whatsAppConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) {
      return { state: ConversationState.IDLE, messages: [] };
    }

    // Check for existing active trip
    if (conversation.activeTripId) {
      const trip = await this.tripService.getTrip(conversation.activeTripId);
      if (trip && ['requested', 'matched', 'arrived', 'active'].includes(trip.status)) {
        return this.showTripStatus(trip);
      }
    }

    // Check for in-progress booking with data
    const booking = this.getBooking(conversation);
    if (booking.pickup && booking.destination) {
      return this.showConfirmation(conversationId, booking);
    }

    // Start fresh
    await this.saveBooking(conversationId, { startedAt: new Date().toISOString() });

    return {
      state: ConversationState.AWAITING_PICKUP,
      messages: [{
        type: 'buttons',
        text: 'Where are you going?\n\n📍 Share your location or type an address.',
        buttons: [
          { id: 'share_location', title: '📍 Share Location' },
          { id: 'enter_address', title: '✏️ Enter Address' },
        ],
      }],
    };
  }

  async handlePickup(
    conversationId: string,
    input: { type: 'text'; text: string } | { type: 'location'; lat: number; lng: number; address?: string },
  ): Promise<BookingResponse> {
    const conversation = await this.prisma.whatsAppConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) {
      return { state: ConversationState.IDLE, messages: [] };
    }

    let pickup: ActiveBooking['pickup'];

    if (input.type === 'location') {
      pickup = { lat: input.lat, lng: input.lng, address: input.address || `${input.lat}, ${input.lng}` };
    } else {
      // Text input — search via Maps
      try {
        const results = await this.mapsService.placesAutocomplete(input.text);
        if (results.length === 0) {
          return {
            state: ConversationState.AWAITING_PICKUP,
            messages: [{ type: 'text', text: `No results found for "${input.text}". Try a different address or share your location.` }],
          };
        }
        if (results.length === 1) {
          const details = await this.mapsService.placesDetails(results[0].placeId);
          if (details) {
            pickup = { lat: details.lat, lng: details.lng, address: details.description };
          }
        } else {
          // Show top 3 as options — store in booking for later selection
          const booking = this.getBooking(conversation);
          booking.pickup = { lat: 0, lng: 0, address: '' }; // placeholder
          (booking as any)._pickupOptions = results.slice(0, 3).map((r) => ({
            placeId: r.placeId,
            description: r.description,
          }));
          await this.saveBooking(conversationId, booking);

          return {
            state: ConversationState.AWAITING_PICKUP,
            messages: [{
              type: 'list',
              title: 'Select your pickup location',
              description: `Results for "${input.text}":`,
              listButtonText: 'Choose',
              listSections: [{
                title: 'Locations',
                rows: results.slice(0, 3).map((r, i) => ({
                  id: `pickup_${i}`,
                  title: r.description,
                })),
              }],
            }],
          };
        }
      } catch (error) {
        this.logger.error(`Places autocomplete failed: ${error.message}`);
        return {
          state: ConversationState.AWAITING_PICKUP,
          messages: [{ type: 'text', text: 'Could not find that location. Please try again or share your location pin.' }],
        };
      }
    }

    if (!pickup) {
      return {
        state: ConversationState.AWAITING_PICKUP,
        messages: [{ type: 'text', text: 'Could not resolve that location. Please try again.' }],
      };
    }

    const booking = this.getBooking(conversation);
    booking.pickup = pickup;
    await this.saveBooking(conversationId, booking);

    const next = ConversationFSM.transition(conversation.conversationState as ConversationState, 'pickup_received');
    if (!next) {
      return { state: conversation.conversationState as ConversationState, messages: [] };
    }

    return {
      state: next,
      messages: [{
        type: 'buttons',
        text: `Pickup: ${pickup.address}\n\nNow, where are you going?`,
        buttons: [
          { id: 'share_location', title: '📍 Share Location' },
          { id: 'enter_address', title: '✏️ Enter Address' },
        ],
      }],
    };
  }

  async handleDestination(
    conversationId: string,
    input: { type: 'text'; text: string } | { type: 'location'; lat: number; lng: number; address?: string },
  ): Promise<BookingResponse> {
    const conversation = await this.prisma.whatsAppConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) {
      return { state: ConversationState.IDLE, messages: [] };
    }

    let destination: ActiveBooking['destination'];

    if (input.type === 'location') {
      destination = { lat: input.lat, lng: input.lng, address: input.address || `${input.lat}, ${input.lng}` };
    } else {
      try {
        const results = await this.mapsService.placesAutocomplete(input.text);
        if (results.length === 0) {
          return {
            state: ConversationState.AWAITING_DESTINATION,
            messages: [{ type: 'text', text: `No results for "${input.text}". Try a different address.` }],
          };
        }
        if (results.length === 1) {
          const details = await this.mapsService.placesDetails(results[0].placeId);
          if (details) {
            destination = { lat: details.lat, lng: details.lng, address: details.description };
          }
        } else {
          const booking = this.getBooking(conversation);
          (booking as any)._destOptions = results.slice(0, 3).map((r) => ({
            placeId: r.placeId,
            description: r.description,
          }));
          await this.saveBooking(conversationId, booking);

          return {
            state: ConversationState.AWAITING_DESTINATION,
            messages: [{
              type: 'list',
              title: 'Select your destination',
              description: `Results for "${input.text}":`,
              listButtonText: 'Choose',
              listSections: [{
                title: 'Locations',
                rows: results.slice(0, 3).map((r, i) => ({
                  id: `dest_${i}`,
                  title: r.description,
                })),
              }],
            }],
          };
        }
      } catch (error) {
        this.logger.error(`Places autocomplete failed: ${error.message}`);
        return {
          state: ConversationState.AWAITING_DESTINATION,
          messages: [{ type: 'text', text: 'Could not find that location. Please try again.' }],
        };
      }
    }

    if (!destination) {
      return {
        state: ConversationState.AWAITING_DESTINATION,
        messages: [{ type: 'text', text: 'Could not resolve that location. Please try again.' }],
      };
    }

    const booking = this.getBooking(conversation);
    booking.destination = destination;
    await this.saveBooking(conversationId, booking);

    const next = ConversationFSM.transition(conversation.conversationState as ConversationState, 'destination_received');
    if (!next) {
      return { state: conversation.conversationState as ConversationState, messages: [] };
    }

    // Fetch vehicle options with fares
    return this.showVehicleOptions(conversationId, booking, next);
  }

  private async showVehicleOptions(
    conversationId: string,
    booking: ActiveBooking,
    nextState: ConversationState,
  ): Promise<BookingResponse> {
    if (!booking.pickup || !booking.destination) {
      return { state: ConversationState.AWAITING_PICKUP, messages: [] };
    }

    const vehicleTypes = [VehicleType.KEKE, VehicleType.CAR, VehicleType.BIKE];
    const rows: { id: string; title: string; description: string }[] = [];

    for (const vType of vehicleTypes) {
      try {
        // Use pricingService to get estimate for each vehicle type
        const metrics = await this.pricingService.resolveRouteMetrics(
          booking.pickup,
          booking.destination,
        );

        const estimate = await this.pricingService.estimateFare({
          vehicleType: vType,
          distanceKm: metrics.distanceKm,
          durationMin: metrics.durationMin,
          pickup: booking.pickup,
        });

        // Find nearby drivers for this vehicle type
        let driverCount = 0;
        try {
          const candidates = await this.matchingService.findCandidates(
            booking.pickup,
            vType,
          );
          driverCount = candidates.length;
        } catch {
          // Ignore errors — just show 0 drivers
        }

        const emoji = vType === VehicleType.KEKE ? '🛺' : vType === VehicleType.CAR ? '🚗' : '🏍️';
        const etaMin = driverCount > 0 ? Math.max(2, Math.round(5 - driverCount * 0.5)) : '?';

        rows.push({
          id: `vehicle_${vType}`,
          title: `${emoji} ${vType.charAt(0).toUpperCase() + vType.slice(1)} — ₦${estimate.totalFare.toLocaleString()}`,
          description: `${estimate.distanceKm.toFixed(1)} km • ${estimate.durationMin} min • ${driverCount} driver${driverCount !== 1 ? 's' : ''} nearby • ETA ~${etaMin} min`,
        });

        // Store first estimate as default
        if (!booking.fareEstimate) {
          booking.fareEstimate = {
            baseFare: estimate.baseFare,
            distanceFare: estimate.distanceFare,
            timeFare: estimate.timeFare,
            rawFare: estimate.rawFare,
            totalFare: estimate.totalFare,
            distanceKm: metrics.distanceKm,
            durationMin: metrics.durationMin,
            surgeMultiplier: estimate.surgeMultiplier,
          };
          booking.vehicleType = vType;
        }
      } catch (error) {
        this.logger.warn(`Failed to get fare for ${vType}: ${error.message}`);
      }
    }

    await this.saveBooking(conversationId, booking);

    return {
      state: nextState,
      messages: [{
        type: 'list',
        title: 'Choose your ride',
        description: `From: ${booking.pickup.address}\nTo: ${booking.destination.address}`,
        listButtonText: 'Select',
        listSections: [{
          title: 'Available Rides',
          rows,
        }],
      }],
    };
  }

  async selectVehicle(
    conversationId: string,
    vehicleType: string,
  ): Promise<BookingResponse> {
    const conversation = await this.prisma.whatsAppConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) {
      return { state: ConversationState.IDLE, messages: [] };
    }

    const booking = this.getBooking(conversation);
    booking.vehicleType = vehicleType;

    // Re-fetch fare for selected vehicle
    if (booking.pickup && booking.destination) {
      try {
        const metrics = await this.pricingService.resolveRouteMetrics(
          booking.pickup,
          booking.destination,
        );
        const estimate = await this.pricingService.estimateFare({
          vehicleType: vehicleType as VehicleType,
          distanceKm: metrics.distanceKm,
          durationMin: metrics.durationMin,
          pickup: booking.pickup,
        });
        booking.fareEstimate = {
          baseFare: estimate.baseFare,
          distanceFare: estimate.distanceFare,
          timeFare: estimate.timeFare,
          rawFare: estimate.rawFare,
          totalFare: estimate.totalFare,
          distanceKm: metrics.distanceKm,
          durationMin: metrics.durationMin,
          surgeMultiplier: estimate.surgeMultiplier,
        };
      } catch (error) {
        this.logger.warn(`Failed to refresh fare: ${error.message}`);
      }
    }

    await this.saveBooking(conversationId, booking);

    const next = ConversationFSM.transition(
      conversation.conversationState as ConversationState,
      'vehicle_selected',
    );
    if (!next) {
      return { state: conversation.conversationState as ConversationState, messages: [] };
    }

    return this.showConfirmation(conversationId, booking, next);
  }

  private showConfirmation(
    conversationId: string,
    booking: ActiveBooking,
    nextState?: ConversationState,
  ): BookingResponse {
    const state = nextState || ConversationState.CONFIRMING_RIDE;

    if (!booking.pickup || !booking.destination || !booking.fareEstimate) {
      return { state: ConversationState.AWAITING_PICKUP, messages: [] };
    }

    const emoji = booking.vehicleType === 'keke' ? '🛺' : booking.vehicleType === 'car' ? '🚗' : '🏍️';
    const summary = [
      `${emoji} ${booking.vehicleType?.toUpperCase()}`,
      '',
      `📍 Pickup: ${booking.pickup.address}`,
      `🏁 Destination: ${booking.destination.address}`,
      `📏 Distance: ${booking.fareEstimate.distanceKm.toFixed(1)} km`,
      `⏱️ Duration: ~${booking.fareEstimate.durationMin} min`,
      `💰 Fare: ₦${booking.fareEstimate.totalFare.toLocaleString()}`,
      booking.fareEstimate.surgeMultiplier > 1
        ? `📈 Surge: ${booking.fareEstimate.surgeMultiplier}x`
        : '',
    ].filter(Boolean).join('\n');

    return {
      state,
      messages: [{
        type: 'buttons',
        text: `${summary}\n\nIs this correct?`,
        buttons: [
          { id: 'confirm_ride', title: '✅ Confirm Ride' },
          { id: 'change_pickup', title: '📍 Change Pickup' },
          { id: 'change_dest', title: '🏁 Change Destination' },
        ],
      }],
    };
  }

  async confirmRide(
    conversationId: string,
    paymentMethod: string = 'cash',
  ): Promise<BookingResponse> {
    const conversation = await this.prisma.whatsAppConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) {
      return { state: ConversationState.IDLE, messages: [] };
    }

    const booking = this.getBooking(conversation);
    if (!booking.pickup || !booking.destination || !booking.vehicleType) {
      return {
        state: ConversationState.IDLE,
        messages: [{ type: 'text', text: 'Booking data incomplete. Let\'s start over.' }],
      };
    }

    // Idempotency check
    const lockKey = `wa:ride:${conversationId}:${Math.floor(Date.now() / 30000)}`;
    // We'll use idempotency service in the WhatsApp layer, not here

    try {
      const result = await this.tripService.requestTrip(
        conversation.userId!,
        {
          pickup: booking.pickup,
          pickupAddress: booking.pickup.address,
          destination: booking.destination,
          destinationAddress: booking.destination.address,
          vehicleType: booking.vehicleType as VehicleType,
          paymentMethod: paymentMethod as PaymentMethod,
        },
        TripSource.WHATSAPP,
      );

      booking.tripId = result.trip.id;
      await this.saveBooking(conversationId, booking);

      const next = ConversationFSM.transition(
        conversation.conversationState as ConversationState,
        'confirm_ride',
      );

      return {
        state: next || ConversationState.WAITING_FOR_MATCH,
        messages: [{
          type: 'text',
          text: `✅ Ride confirmed!\n\nTrip ID: ${result.trip.id.slice(0, 8)}\n` +
            `💰 Fare: ₦${result.estimate.totalFare.toLocaleString()}\n` +
            `💳 Payment: ${paymentMethod}\n\n` +
            `🔍 Searching for a driver...`,
        }],
      };
    } catch (error) {
      this.logger.error(`Failed to create trip: ${error.message}`);

      if (error.message?.includes('TRIP_ALREADY_ACTIVE')) {
        return {
          state: ConversationState.IDLE,
          messages: [{
            type: 'buttons',
            text: 'You already have an active trip. Please complete or cancel it first.',
            buttons: [
              { id: 'view_trip', title: '📍 View Trip' },
              { id: 'cancel_trip', title: '❌ Cancel Trip' },
            ],
          }],
        };
      }

      return {
        state: ConversationState.IDLE,
        messages: [{ type: 'text', text: `Booking failed: ${error.message}. Please try again.` }],
      };
    }
  }

  async cancelBooking(conversationId: string, reason?: string): Promise<BookingResponse> {
    const conversation = await this.prisma.whatsAppConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) {
      return { state: ConversationState.IDLE, messages: [] };
    }

    const booking = this.getBooking(conversation);

    // If there's an active trip, cancel it
    if (booking.tripId) {
      try {
        await this.tripService.cancelTrip(
          booking.tripId,
          'passenger',
          reason || 'Cancelled via WhatsApp',
        );
      } catch (error) {
        this.logger.warn(`Failed to cancel trip ${booking.tripId}: ${error.message}`);
      }
    }

    await this.clearBooking(conversationId);

    return {
      state: ConversationState.IDLE,
      messages: [{ type: 'text', text: '❌ Booking cancelled. Type "menu" to start again.' }],
      clearBooking: true,
    };
  }

  private showTripStatus(trip: any): BookingResponse {
    const statusEmoji: Record<string, string> = {
      requested: '🔍',
      matched: '🚗',
      arrived: '📍',
      active: '🛣️',
      completed: '✅',
      cancelled: '❌',
    };

    const statusText: Record<string, string> = {
      requested: 'Searching for a driver...',
      matched: `Driver assigned: ${trip.driverId ? 'Check your trip for details' : 'Unknown'}`,
      arrived: 'Driver has arrived at pickup!',
      active: 'Trip in progress',
      completed: 'Trip completed',
      cancelled: 'Trip was cancelled',
    };

    return {
      state: ConversationState.TRIP_ACTIVE,
      messages: [{
        type: 'text',
        text: `${statusEmoji[trip.status] || '📋'} Trip Status: ${trip.status.toUpperCase()}\n\n` +
          `${statusText[trip.status] || trip.status}\n\n` +
          `📍 ${trip.pickupAddress}\n` +
          `🏁 ${trip.destinationAddress}\n` +
          `💰 ₦${trip.totalFare?.toLocaleString() || 'TBD'}`,
      }],
    };
  }
}
```

---

## Acceptance Criteria

- [ ] `ActiveBooking` interface defined with all booking fields
- [ ] `BookingResponse` and `BookingMessage` types defined
- [ ] `BookingOrchestrator` injected with TripService, PricingService, MatchingService, MapsService
- [ ] `startBooking()` checks active trips, returns pickup prompt
- [ ] `handlePickup()` supports both text (Maps search) and location pin
- [ ] `handleDestination()` supports both text (Maps search) and location pin
- [ ] `selectVehicle()` fetches fares for each vehicle type
- [ ] `confirmRide()` calls `TripService.requestTrip` with `source='whatsapp'`
- [ ] `cancelBooking()` cancels active trip and clears booking state
- [ ] All methods return `BookingResponse` (never send WhatsApp messages directly)
- [ ] Google Maps navigation links generated for driver messages
- [ ] `pnpm build api` compiles without errors

---

## Verification

```bash
cd apps/api
pnpm build
# Verify: startBooking returns AWAITING_PICKUP with location buttons
# Verify: handlePickup with text calls MapsService.placesAutocomplete
# Verify: confirmRide creates trip with source=whatsapp
```
