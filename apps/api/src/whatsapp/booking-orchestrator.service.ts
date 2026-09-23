import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { PaymentMethod, RideMode, TripSource, VehicleType } from '@higo/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { TripService } from '../trips/trips.service';
import { PricingService } from '../pricing/pricing.service';
import { MatchingService } from '../matching/matching.service';
import { MapsService } from '../maps/maps.service';
import { PaymentService } from '../payments/payment.service';
import { ConversationFSM } from './conversation.fsm';
import { WhatsAppAnalytics } from './analytics.service';
import {
  ActiveBooking,
  BookingResponse,
  ConversationState,
} from './whatsapp.types';

type LocationInput =
  | { type: 'text'; text: string }
  | { type: 'location'; lat: number; lng: number; address?: string; name?: string };

@Injectable()
export class BookingOrchestrator {
  private readonly logger = new Logger(BookingOrchestrator.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tripService: TripService,
    private readonly pricingService: PricingService,
    private readonly matchingService: MatchingService,
    private readonly mapsService: MapsService,
    private readonly paymentService: PaymentService,
    private readonly analytics: WhatsAppAnalytics,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private getBooking(conversation: { activeBooking: unknown }): ActiveBooking {
    return (conversation.activeBooking as ActiveBooking | null) || {};
  }

  private async saveBooking(conversationId: string, booking: ActiveBooking): Promise<void> {
    await this.prisma.whatsAppConversation.update({
      where: { id: conversationId },
      data: {
        activeBooking: booking as any,
        sessionExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
  }

  private async clearBooking(conversationId: string): Promise<void> {
    await this.prisma.whatsAppConversation.update({
      where: { id: conversationId },
      data: { activeBooking: Prisma.DbNull, activeTripId: null, sessionExpiresAt: null },
    });
  }

  async startBooking(conversationId: string): Promise<BookingResponse> {
    const conversation = await this.prisma.whatsAppConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) return { state: ConversationState.IDLE, messages: [] };

    if (conversation.activeTripId) {
      const trip = await this.tripService.getTrip(conversation.activeTripId);
      if (trip && ['requested', 'matched', 'arrived', 'active'].includes(trip.status)) {
        return this.showTripStatus(trip);
      }
    }

    const booking = this.getBooking(conversation);
    if (booking.pickup && booking.destination && booking.fareEstimate) {
      return this.showConfirmation(booking);
    }

    await this.saveBooking(conversationId, { startedAt: new Date().toISOString() });

    void this.analytics.track('booking_started', conversationId);

    return {
      state: ConversationState.AWAITING_PICKUP,
      messages: [{
        type: 'buttons',
        text: 'Where should we pick you up? Share your location pin or type the pickup address.',
        buttons: [
          { id: 'share_location', title: 'Share Location' },
          { id: 'enter_address', title: 'Enter Address' },
        ],
      }],
    };
  }

  async handlePickup(conversationId: string, input: LocationInput): Promise<BookingResponse> {
    const conversation = await this.prisma.whatsAppConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) return { state: ConversationState.IDLE, messages: [] };

    const resolved = await this.resolveLocation(input);
    if ('options' in resolved) {
      const booking = this.getBooking(conversation);
      booking.pickupOptions = resolved.options;
      await this.saveBooking(conversationId, booking);
      return this.locationOptionsResponse(
        ConversationState.AWAITING_PICKUP,
        'Select your pickup location',
        resolved.options,
        'pickup',
      );
    }
    if (!resolved.location) {
      return {
        state: ConversationState.AWAITING_PICKUP,
        messages: [{ type: 'text', text: 'I could not resolve that pickup. Please try another address or share your location pin.' }],
      };
    }

    const booking = this.getBooking(conversation);
    booking.pickup = resolved.location;
    await this.saveBooking(conversationId, booking);

    void this.analytics.track('pickup_received', conversationId);

    const next = ConversationFSM.transition(
      conversation.conversationState as ConversationState,
      'pickup_received',
    ) || ConversationState.AWAITING_DESTINATION;

    return {
      state: next,
      messages: [{
        type: 'buttons',
        text: `Pickup set: ${resolved.location.address}\n\nWhere are you going?`,
        buttons: [
          { id: 'share_location', title: 'Share Location' },
          { id: 'enter_address', title: 'Enter Address' },
        ],
      }],
    };
  }

  async handleDestination(conversationId: string, input: LocationInput): Promise<BookingResponse> {
    const conversation = await this.prisma.whatsAppConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) return { state: ConversationState.IDLE, messages: [] };

    const resolved = await this.resolveLocation(input);
    if ('options' in resolved) {
      const booking = this.getBooking(conversation);
      booking.destinationOptions = resolved.options;
      await this.saveBooking(conversationId, booking);
      return this.locationOptionsResponse(
        ConversationState.AWAITING_DESTINATION,
        'Select your destination',
        resolved.options,
        'dest',
      );
    }
    if (!resolved.location) {
      return {
        state: ConversationState.AWAITING_DESTINATION,
        messages: [{ type: 'text', text: 'I could not resolve that destination. Please try another address or share a location pin.' }],
      };
    }

    const booking = this.getBooking(conversation);
    booking.destination = resolved.location;
    await this.saveBooking(conversationId, booking);

    void this.analytics.track('destination_received', conversationId);

    const next = ConversationFSM.transition(
      conversation.conversationState as ConversationState,
      'destination_received',
    ) || ConversationState.SELECTING_VEHICLE;

    return this.showVehicleOptions(conversationId, booking, next);
  }

  async selectVehicle(conversationId: string, vehicleType: string): Promise<BookingResponse> {
    const conversation = await this.prisma.whatsAppConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) return { state: ConversationState.IDLE, messages: [] };

    const booking = this.getBooking(conversation);
    booking.vehicleType = vehicleType;
    await this.refreshFare(booking, vehicleType as VehicleType);
    await this.saveBooking(conversationId, booking);

    void this.analytics.track('vehicle_selected', conversationId);

    const next = ConversationFSM.transition(
      conversation.conversationState as ConversationState,
      'vehicle_selected',
    ) || ConversationState.CONFIRMING_RIDE;

    return this.showConfirmation(booking, next);
  }

  async confirmRide(conversationId: string, paymentMethod: PaymentMethod = PaymentMethod.CASH): Promise<BookingResponse> {
    const conversation = await this.prisma.whatsAppConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) return { state: ConversationState.IDLE, messages: [] };

    const booking = this.getBooking(conversation);
    if (!conversation.userId || !booking.pickup || !booking.destination || !booking.vehicleType) {
      return {
        state: ConversationState.IDLE,
        messages: [{ type: 'text', text: 'Booking data is incomplete. Type "book" to start again.' }],
        clearBooking: true,
      };
    }

    // Online payment flow — create trip first, then initialize Paystack
    if (paymentMethod === PaymentMethod.CARD || paymentMethod === PaymentMethod.BANK) {
      return this.initiateOnlinePayment(conversationId, conversation.userId, booking, paymentMethod);
    }

    // Cash flow — create trip and dispatch immediately
    try {
      const result = await this.tripService.requestTrip(
        conversation.userId,
        {
          pickup: { lat: booking.pickup.lat, lng: booking.pickup.lng },
          pickupAddress: booking.pickup.address,
          destination: { lat: booking.destination.lat, lng: booking.destination.lng },
          destinationAddress: booking.destination.address,
          vehicleType: booking.vehicleType as VehicleType,
          paymentMethod,
          promoCode: booking.promoCode,
          rideMode: RideMode.INSTANT,
        },
        TripSource.WHATSAPP,
      );

      booking.tripId = result.trip.id;
      booking.paymentMethod = paymentMethod;
      await this.prisma.whatsAppConversation.update({
        where: { id: conversationId },
        data: {
          activeBooking: booking as any,
          activeTripId: result.trip.id,
          sessionExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });

      this.eventEmitter.emit('whatsapp.booking.confirmed', {
        conversationId,
        tripId: result.trip.id,
        source: TripSource.WHATSAPP,
      });

      void this.analytics.track('booking_confirmed', conversationId);

      const next = ConversationFSM.transition(
        conversation.conversationState as ConversationState,
        'confirm_ride',
      ) || ConversationState.WAITING_FOR_MATCH;

      return {
        state: next,
        messages: [{
          type: 'text',
          text: [
            'Ride confirmed.',
            `Trip ID: ${result.trip.id.slice(0, 8)}`,
            `Fare: ${this.formatFare(result.estimate.totalFare)}`,
            `Payment: Cash`,
            '',
            'Searching for a driver now.',
          ].join('\n'),
        }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to create WhatsApp trip: ${message}`);
      return {
        state: ConversationState.CONFIRMING_RIDE,
        messages: [{ type: 'text', text: `Booking failed: ${message}. Please try again.` }],
      };
    }
  }

  async cancelBooking(conversationId: string, reason = 'Cancelled via WhatsApp'): Promise<BookingResponse> {
    const conversation = await this.prisma.whatsAppConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) return { state: ConversationState.IDLE, messages: [] };

    const booking = this.getBooking(conversation);
    const tripId = conversation.activeTripId || booking.tripId;
    if (tripId) {
      try {
        await this.tripService.cancelTrip(tripId, 'passenger', reason);
      } catch (error) {
        this.logger.warn(`Failed to cancel WhatsApp trip ${tripId}: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }

    await this.clearBooking(conversationId);
    return {
      state: ConversationState.IDLE,
      messages: [{ type: 'text', text: 'Booking cancelled. Type "book" when you need another ride.' }],
      clearBooking: true,
    };
  }

  private async initiateOnlinePayment(
    conversationId: string,
    passengerId: string,
    booking: ActiveBooking,
    paymentMethod: PaymentMethod,
  ): Promise<BookingResponse> {
    if (!booking.fareEstimate || !booking.pickup || !booking.destination || !booking.vehicleType) {
      return {
        state: ConversationState.CONFIRMING_RIDE,
        messages: [{ type: 'text', text: 'Payment setup failed — missing fare details. Please try again.' }],
      };
    }

    try {
      // Create trip first so it exists for the webhook
      const result = await this.tripService.requestTrip(
        passengerId,
        {
          pickup: { lat: booking.pickup.lat, lng: booking.pickup.lng },
          pickupAddress: booking.pickup.address,
          destination: { lat: booking.destination.lat, lng: booking.destination.lng },
          destinationAddress: booking.destination.address,
          vehicleType: booking.vehicleType as VehicleType,
          paymentMethod,
          promoCode: booking.promoCode,
          rideMode: RideMode.INSTANT,
        },
        TripSource.WHATSAPP,
      );

      const tripId = result.trip.id;
      booking.tripId = tripId;
      booking.paymentMethod = paymentMethod;
      await this.prisma.whatsAppConversation.update({
        where: { id: conversationId },
        data: {
          activeBooking: booking as any,
          activeTripId: tripId,
          sessionExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      });

      // Initialize Paystack checkout
      const initResult = await this.paymentService.initialize(passengerId, {
        tripId,
        paymentMethod,
      });

      const next = ConversationFSM.transition(
        booking as any,
        'payment_selected',
      ) || ConversationState.WAITING_FOR_MATCH;

      return {
        state: next,
        messages: [{
          type: 'text',
          text: [
            '💳 Online Payment',
            '',
            `Amount: ${this.formatFare(booking.fareEstimate.totalFare)}`,
            '',
            'Click the link below to pay:',
            initResult.authorizationUrl,
            '',
            'After payment, your ride will be confirmed automatically.',
            '',
            '⏰ Link expires in 10 minutes.',
          ].join('\n'),
        }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Online payment setup failed: ${message}`);
      return {
        state: ConversationState.CONFIRMING_RIDE,
        messages: [{ type: 'text', text: `Payment setup failed: ${message}. Try cash instead?` }],
      };
    }
  }

  private async resolveLocation(input: LocationInput): Promise<
    | { location: { lat: number; lng: number; address: string } }
    | { location: null }
    | { options: Array<{ placeId: string; description: string }> }
  > {
    if (input.type === 'location') {
      const reverse = await this.mapsService.reverseGeocode(input.lat, input.lng).catch(() => null);
      return {
        location: {
          lat: reverse?.lat ?? input.lat,
          lng: reverse?.lng ?? input.lng,
          address: input.address || input.name || reverse?.description || `${input.lat}, ${input.lng}`,
        },
      };
    }

    const results = await this.mapsService.placesAutocomplete(input.text);
    const suggestions = results.suggestions || [];
    if (suggestions.length === 0) return { location: null };
    if (suggestions.length > 1) {
      return { options: suggestions.slice(0, 3) };
    }

    const details = await this.mapsService.placesDetails(suggestions[0].placeId);
    if (!details) return { location: null };
    return {
      location: {
        lat: details.lat,
        lng: details.lng,
        address: details.description,
      },
    };
  }

  private locationOptionsResponse(
    state: ConversationState,
    title: string,
    options: Array<{ placeId: string; description: string }>,
    idPrefix: 'pickup' | 'dest',
  ): BookingResponse {
    return {
      state,
      messages: [{
        type: 'list',
        title,
        text: title,
        listButtonText: 'Choose',
        listSections: [{
          title: 'Locations',
          rows: options.map((option, index) => ({
            id: `${idPrefix}_${index}`,
            title: option.description.slice(0, 24),
            description: option.description,
          })),
        }],
      }],
    };
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
    const rows = [];

    for (const vehicleType of vehicleTypes) {
      try {
        const estimate = await this.refreshFare(booking, vehicleType);
        let driverCount = 0;
        try {
          const candidates = await this.matchingService.findCandidates(booking.pickup, vehicleType);
          driverCount = candidates.length;
        } catch {
          driverCount = 0;
        }

        rows.push({
          id: `vehicle_${vehicleType}`,
          title: `${this.vehicleLabel(vehicleType)} ${this.formatFare(estimate.totalFare)}`.slice(0, 24),
          description: `${estimate.distanceKm.toFixed(1)} km, ${estimate.durationMin} min, ${driverCount} nearby`,
        });
      } catch (error) {
        this.logger.warn(`Could not price ${vehicleType}: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }

    await this.saveBooking(conversationId, booking);

    if (rows.length === 0) {
      return {
        state: ConversationState.AWAITING_DESTINATION,
        messages: [{ type: 'text', text: 'I could not calculate fares for this route. Please try another destination.' }],
      };
    }

    return {
      state: nextState,
      messages: [{
        type: 'list',
        title: 'Choose your ride',
        text: `From: ${booking.pickup.address}\nTo: ${booking.destination.address}`,
        listButtonText: 'Select',
        listSections: [{ title: 'Available rides', rows }],
      }],
    };
  }

  private async refreshFare(booking: ActiveBooking, vehicleType: VehicleType) {
    if (!booking.pickup || !booking.destination) {
      throw new Error('Pickup and destination are required before pricing');
    }

    const metrics = await this.pricingService.resolveRouteMetrics(booking.pickup, booking.destination);
    const estimate = await this.pricingService.estimateFare({
      vehicleType,
      distanceKm: metrics.distanceKm,
      durationMin: metrics.durationMin,
      pickup: booking.pickup,
      destination: booking.destination,
      rideMode: RideMode.INSTANT,
      promoCode: booking.promoCode,
    });

    booking.vehicleType = booking.vehicleType || vehicleType;
    booking.fareEstimate = {
      baseFare: estimate.baseFare,
      distanceFare: estimate.distanceFare,
      timeFare: estimate.timeFare,
      rawFare: estimate.rawFare,
      totalFare: estimate.totalFare,
      distanceKm: estimate.distanceKm,
      durationMin: estimate.durationMin,
      surgeMultiplier: estimate.surgeMultiplier,
    };
    return estimate;
  }

  private showConfirmation(booking: ActiveBooking, state = ConversationState.CONFIRMING_RIDE): BookingResponse {
    if (!booking.pickup || !booking.destination || !booking.fareEstimate || !booking.vehicleType) {
      return { state: ConversationState.AWAITING_PICKUP, messages: [] };
    }

    return {
      state,
      messages: [{
        type: 'buttons',
        text: [
          `${this.vehicleLabel(booking.vehicleType)} ride`,
          `Pickup: ${booking.pickup.address}`,
          `Destination: ${booking.destination.address}`,
          `Distance: ${booking.fareEstimate.distanceKm.toFixed(1)} km`,
          `Duration: ${booking.fareEstimate.durationMin} min`,
          `Fare: ${this.formatFare(booking.fareEstimate.totalFare)}`,
          '',
          'Confirm this ride?',
        ].join('\n'),
        buttons: [
          { id: 'confirm_ride', title: 'Confirm Ride' },
          { id: 'change_pickup', title: 'Change Pickup' },
          { id: 'change_dest', title: 'Change Destination' },
        ],
      }],
    };
  }

  private showTripStatus(trip: any): BookingResponse {
    return {
      state: ConversationState.TRIP_ACTIVE,
      messages: [{
        type: 'text',
        text: [
          `Trip status: ${String(trip.status).toUpperCase()}`,
          `Pickup: ${trip.pickupAddress}`,
          `Destination: ${trip.destinationAddress}`,
          `Fare: ${this.formatFare(trip.totalFare || 0)}`,
        ].join('\n'),
      }],
    };
  }

  private formatFare(kobo: number): string {
    return `NGN ${(Number(kobo || 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }

  private vehicleLabel(vehicleType: string): string {
    const labels: Record<string, string> = {
      [VehicleType.KEKE]: 'Keke',
      [VehicleType.CAR]: 'Car',
      [VehicleType.BIKE]: 'Bike',
    };
    return labels[vehicleType] || vehicleType;
  }
}
