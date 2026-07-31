import { Injectable, Inject, forwardRef, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ZonesService } from '../zones/zones.service';
import { PricingService } from '../pricing/pricing.service';
import { MatchingService } from '../matching/matching.service';
import { EventsGateway } from '../realtime/events.gateway';
import { PaymentService } from '../payments/payment.service';
import { PushService } from '../push/push.service';
import { PromosService } from '../promos/promos.service';
import { validateTransition } from './trip-state-machine';
import { RedisService } from '../redis/redis.service';
import {
  LatLng,
  Trip,
  TripStatus,
  VehicleType,
  PaymentMethod,
  PaymentStatus,
  RideMode,
  FareNegotiationResponse,
  QuoteTripResponse,
  RequestTripRequest,
  RequestTripResponse,
  CancelTripResponse,
  GetTripStatusResponse,
  PaginatedResponse,
  PaginationQuery,
  RateResponse,
  SOCKET_EVENTS,
  TripMatchedPayload,
} from '@higo/shared-types';
import { AppException } from '../common/errors/app.exception';
import { AuthUser } from '../common/types/auth-user';
import * as crypto from 'crypto';

interface PreparedTripRequest {
  distanceKm: number;
  durationMin: number;
  estimate: RequestTripResponse['estimate'];
}

type DriverNegotiationResponseRow = FareNegotiationResponse['driverResponses'][number];

interface NegotiationConfig {
  isEnabled: boolean;
  maxRounds: number;
  maxTimeSec: number;
  saveMorePct: number;
  priorityPickupPct: number;
  minFare: number;
  maxFare: number;
}

@Injectable()
export class TripService {
  private readonly logger = new Logger(TripService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly zonesService: ZonesService,
    private readonly pricingService: PricingService,
    @Inject(forwardRef(() => MatchingService))
    private readonly matchingService: MatchingService,
    private readonly eventsGateway: EventsGateway,
    @Inject(forwardRef(() => PaymentService))
    private readonly paymentService: PaymentService,
    private readonly pushService: PushService,
    private readonly promosService: PromosService,
  ) {}

  /** Launch envelope when micro-zones miss GPS / autocomplete coordinates. */
  private isWithinAbujaMetro(point: LatLng): boolean {
    return point.lat >= 8.95 && point.lat <= 9.15 && point.lng >= 7.25 && point.lng <= 7.55;
  }

  private async isInServiceArea(point: LatLng): Promise<boolean> {
    if (await this.zonesService.isPointInPermittedZone(point)) {
      return true;
    }
    return this.isWithinAbujaMetro(point);
  }

  private haversineDistance(p1: LatLng, p2: LatLng): number {
    const R = 6371; // Earth radius in km
    const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
    const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((p1.lat * Math.PI) / 180) *
        Math.cos((p2.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private roundNegotiationFare(amount: number): number {
    return Math.round(amount / 1000) * 1000;
  }

  private async getNegotiationConfig(): Promise<NegotiationConfig> {
    const defaults: NegotiationConfig = {
      isEnabled: true,
      maxRounds: 3,
      maxTimeSec: 60,
      saveMorePct: 12,
      priorityPickupPct: 10,
      minFare: 20000,
      maxFare: 1000000,
    };

    const settingsRow = await this.prisma.platformSettings.findUnique({
      where: { id: 'default' },
    });
    const settings = (settingsRow?.settings ?? {}) as Record<string, any>;
    const config = settings.negotiation ?? {};

    return {
      isEnabled: config.isEnabled ?? config.is_enabled ?? defaults.isEnabled,
      maxRounds: config.maxRounds ?? config.max_rounds ?? defaults.maxRounds,
      maxTimeSec: config.maxTimeSec ?? config.max_time_sec ?? defaults.maxTimeSec,
      saveMorePct: config.saveMorePct ?? config.save_more_pct ?? defaults.saveMorePct,
      priorityPickupPct:
        config.priorityPickupPct ?? config.priority_pickup_pct ?? defaults.priorityPickupPct,
      minFare: config.minFare ?? config.min_fare ?? defaults.minFare,
      maxFare: config.maxFare ?? config.max_fare ?? defaults.maxFare,
    };
  }

  private clampFare(amount: number, config: NegotiationConfig): number {
    return Math.max(config.minFare, Math.min(config.maxFare, amount));
  }

  getPassengerNegotiationSuggestions(estimatedFare: number, config: NegotiationConfig) {
    const recommended = this.clampFare(this.roundNegotiationFare(estimatedFare), config);
    return {
      saveMore: this.clampFare(
        this.roundNegotiationFare(estimatedFare * (1 - config.saveMorePct / 100)),
        config,
      ),
      recommended,
      priority: this.clampFare(
        this.roundNegotiationFare(estimatedFare * (1 + config.priorityPickupPct / 100)),
        config,
      ),
    };
  }

  getDriverNegotiationSuggestions(
    passengerOffer: number,
    estimatedFare: number,
    config: NegotiationConfig,
  ) {
    return {
      counterRecommended: this.roundNegotiationFare(estimatedFare),
      counterPriority: this.clampFare(
        this.roundNegotiationFare(Math.max(passengerOffer, estimatedFare) * (1 + config.priorityPickupPct / 100)),
        config,
      ),
    };
  }

  private mapNegotiation(row: any): FareNegotiationResponse {
    const responses = (row.driverResponses ?? []) as Array<any>;
    return {
      id: row.id,
      passengerId: row.passengerId,
      passengerName: row.passengerName,
      selectedDriverId: row.selectedDriverId,
      selectedDriverName: row.selectedDriverName,
      pickupAddress: row.pickupAddress,
      pickupLat: Number(row.pickupLat),
      pickupLng: Number(row.pickupLng),
      destinationAddress: row.destinationAddress,
      destinationLat: Number(row.destinationLat),
      destinationLng: Number(row.destinationLng),
      vehicleType: row.vehicleType as VehicleType,
      estimatedFare: row.estimatedFare,
      passengerOffer: row.passengerOffer,
      finalFare: row.finalFare,
      distanceKm: row.distanceKm === null ? null : Number(row.distanceKm),
      durationMin: row.durationMin,
      currentRound: row.currentRound,
      maxRounds: row.maxRounds,
      status: row.status,
      driverResponses: responses.map((response) => ({
        driverId: response.driverId ?? response.driver_id,
        driverName: response.driverName ?? response.driver_name,
        driverRating: Number(response.driverRating ?? response.driver_rating ?? 0),
        driverEtaMin: Number(response.driverEtaMin ?? response.driver_eta_min ?? 0),
        driverVerified: Boolean(response.driverVerified ?? response.driver_verified),
        responseType: response.responseType ?? response.response_type,
        counterAmount: response.counterAmount ?? response.counter_amount ?? null,
        respondedAt: response.respondedAt ?? response.responded_at,
      })),
      closedReason: row.closedReason,
      negotiationDurationSec: row.negotiationDurationSec,
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async assertTripAccess(tripId: string, user: AuthUser): Promise<void> {
    const trip = await this.getTrip(tripId);
    if (!trip) {
      throw new AppException('NOT_FOUND', undefined, 'Trip not found');
    }
    this.assertTripVisibleToUser(trip, user);
  }

  assertTripVisibleToUser(trip: Trip, user: AuthUser): void {
    if (user.type === 'admin') return;
    if (user.type === 'passenger' && trip.passengerId === user.sub) return;
    if (user.type === 'driver' && trip.driverId === user.sub) return;
    throw new AppException('FORBIDDEN', undefined, 'You cannot access this trip');
  }

  private mapTripRow(row: any): Trip {
    const pickupGeo = JSON.parse(row.pickupLocationGeoJson);
    const destGeo = JSON.parse(row.destinationLocationGeoJson);
    const actualPickupGeo = row.actualPickupLocationGeoJson
      ? JSON.parse(row.actualPickupLocationGeoJson)
      : null;

    return {
      id: row.id,
      passengerId: row.passengerId,
      driverId: row.driverId,
      pickupLocation: { lng: pickupGeo.coordinates[0], lat: pickupGeo.coordinates[1] },
      pickupAddress: row.pickupAddress,
      destinationLocation: { lng: destGeo.coordinates[0], lat: destGeo.coordinates[1] },
      destinationAddress: row.destinationAddress,
      routePolyline: row.routePolyline,
      distanceKm: row.distanceKm ? Number(row.distanceKm) : null,
      durationMin: row.durationMin,
      vehicleType: row.vehicleType as VehicleType,
      status: row.status as TripStatus,
      baseFare: row.baseFare,
      distanceFare: row.distanceFare,
      timeFare: row.timeFare,
      rawFare: row.rawFare,
      quotedFare: row.quotedFare,
      minimumFare: row.minimumFare,
      minimumFareApplied: row.minimumFareApplied,
      surgeMultiplier: Number(row.surgeMultiplier),
      modeMultiplier: Number(row.modeMultiplier),
      pricingVersion: row.pricingVersion,
      customerBookingFee: row.customerBookingFee,
      customerStatutoryLevy: row.customerStatutoryLevy,
      totalFare: row.totalFare,
      paymentMethod: row.paymentMethod as PaymentMethod | null,
      paymentStatus: row.paymentStatus as PaymentStatus,
      paystackReference: row.paystackReference,
      promoCode: row.promoCode,
      discountAmount: row.discountAmount,
      passengerRating: row.passengerRating,
      driverRating: row.driverRating,
      rideSharePartnerId: row.rideSharePartnerId,
      isShared: row.isShared,
      rideMode: row.rideMode as RideMode,
      negotiationId: row.negotiationId,
      scheduledFor: row.scheduledFor ? row.scheduledFor.toISOString() : null,
      isScheduled: row.isScheduled,
      startedAt: row.startedAt ? row.startedAt.toISOString() : null,
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
      cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
      cancelReason: row.cancelReason,
      pickupLandmark: row.pickupLandmark,
      pickupVoiceNoteUrl: row.pickupVoiceNoteUrl,
      pickupConfirmedAt: row.pickupConfirmedAt ? row.pickupConfirmedAt.toISOString() : null,
      pickupAttempts: row.pickupAttempts,
      actualPickupLocation: actualPickupGeo
        ? { lng: actualPickupGeo.coordinates[0], lat: actualPickupGeo.coordinates[1] }
        : null,
      cashConfirmedByDriver: row.cashConfirmedByDriver,
      cashConfirmedAt: row.cashConfirmedAt ? row.cashConfirmedAt.toISOString() : null,
      rejectionReason: row.rejectionReason,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async getTrip(tripId: string): Promise<Trip | null> {
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT 
        id,
        passenger_id AS "passengerId",
        driver_id AS "driverId",
        ST_AsGeoJSON(pickup_location) AS "pickupLocationGeoJson",
        pickup_address AS "pickupAddress",
        ST_AsGeoJSON(destination_location) AS "destinationLocationGeoJson",
        destination_address AS "destinationAddress",
        route_polyline AS "routePolyline",
        distance_km AS "distanceKm",
        duration_min AS "durationMin",
        vehicle_type AS "vehicleType",
        status,
        base_fare AS "baseFare",
        distance_fare AS "distanceFare",
        time_fare AS "timeFare",
        raw_fare AS "rawFare",
        quoted_fare AS "quotedFare",
        minimum_fare AS "minimumFare",
        minimum_fare_applied AS "minimumFareApplied",
        surge_multiplier AS "surgeMultiplier",
        mode_multiplier AS "modeMultiplier",
        pricing_version AS "pricingVersion",
        customer_booking_fee AS "customerBookingFee",
        customer_statutory_levy AS "customerStatutoryLevy",
        total_fare AS "totalFare",
        payment_method AS "paymentMethod",
        payment_status AS "paymentStatus",
        paystack_reference AS "paystackReference",
        promo_code AS "promoCode",
        discount_amount AS "discountAmount",
        passenger_rating AS "passengerRating",
        driver_rating AS "driverRating",
        ride_share_partner_id AS "rideSharePartnerId",
        is_shared AS "isShared",
        ride_mode AS "rideMode",
        negotiation_id AS "negotiationId",
        scheduled_for AS "scheduledFor",
        is_scheduled AS "isScheduled",
        started_at AS "startedAt",
        completed_at AS "completedAt",
        cancelled_at AS "cancelledAt",
        cancel_reason AS "cancelReason",
        pickup_landmark AS "pickupLandmark",
        pickup_voice_note_url AS "pickupVoiceNoteUrl",
        pickup_confirmed_at AS "pickupConfirmedAt",
        pickup_attempts AS "pickupAttempts",
        ST_AsGeoJSON(actual_pickup_location) AS "actualPickupLocationGeoJson",
        cash_confirmed_by_driver AS "cashConfirmedByDriver",
        cash_confirmed_at AS "cashConfirmedAt",
        rejection_reason AS "rejectionReason",
        created_at AS "createdAt"
      FROM trips
      WHERE id = ${tripId}::uuid
      LIMIT 1;
    `;

    if (rows.length === 0) return null;
    return this.mapTripRow(rows[0]);
  }

  async getPassengerTrips(
    passengerId: string,
    query: PaginationQuery = {},
  ): Promise<PaginatedResponse<Trip>> {
    const limit = Math.min(Math.max(Number(query.limit ?? 20), 1), 20);
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT
        id,
        passenger_id AS "passengerId",
        driver_id AS "driverId",
        ST_AsGeoJSON(pickup_location) AS "pickupLocationGeoJson",
        pickup_address AS "pickupAddress",
        ST_AsGeoJSON(destination_location) AS "destinationLocationGeoJson",
        destination_address AS "destinationAddress",
        route_polyline AS "routePolyline",
        distance_km AS "distanceKm",
        duration_min AS "durationMin",
        vehicle_type AS "vehicleType",
        status,
        base_fare AS "baseFare",
        distance_fare AS "distanceFare",
        time_fare AS "timeFare",
        raw_fare AS "rawFare",
        quoted_fare AS "quotedFare",
        minimum_fare AS "minimumFare",
        minimum_fare_applied AS "minimumFareApplied",
        surge_multiplier AS "surgeMultiplier",
        mode_multiplier AS "modeMultiplier",
        pricing_version AS "pricingVersion",
        customer_booking_fee AS "customerBookingFee",
        customer_statutory_levy AS "customerStatutoryLevy",
        total_fare AS "totalFare",
        payment_method AS "paymentMethod",
        payment_status AS "paymentStatus",
        paystack_reference AS "paystackReference",
        promo_code AS "promoCode",
        discount_amount AS "discountAmount",
        passenger_rating AS "passengerRating",
        driver_rating AS "driverRating",
        ride_share_partner_id AS "rideSharePartnerId",
        is_shared AS "isShared",
        ride_mode AS "rideMode",
        negotiation_id AS "negotiationId",
        scheduled_for AS "scheduledFor",
        is_scheduled AS "isScheduled",
        started_at AS "startedAt",
        completed_at AS "completedAt",
        cancelled_at AS "cancelledAt",
        cancel_reason AS "cancelReason",
        pickup_landmark AS "pickupLandmark",
        pickup_voice_note_url AS "pickupVoiceNoteUrl",
        pickup_confirmed_at AS "pickupConfirmedAt",
        pickup_attempts AS "pickupAttempts",
        ST_AsGeoJSON(actual_pickup_location) AS "actualPickupLocationGeoJson",
        cash_confirmed_by_driver AS "cashConfirmedByDriver",
        cash_confirmed_at AS "cashConfirmedAt",
        rejection_reason AS "rejectionReason",
        created_at AS "createdAt"
      FROM trips
      WHERE passenger_id = ${passengerId}::uuid
        AND (${query.cursor ?? null}::timestamp IS NULL OR created_at < ${query.cursor ?? null}::timestamp)
      ORDER BY created_at DESC
      LIMIT ${limit + 1};
    `;

    const hasNextPage = rows.length > limit;
    const pageRows = rows.slice(0, limit);
    const items = pageRows.map((row) => this.mapTripRow(row));

    return {
      items,
      pageInfo: {
        nextCursor: hasNextPage ? pageRows[pageRows.length - 1].createdAt.toISOString() : null,
        hasNextPage,
        count: items.length,
      },
    };
  }

  private async prepareTripRequest(
    dto: RequestTripRequest,
    options: { redeemPromo: boolean },
  ): Promise<PreparedTripRequest> {
    const restrictedPickup = await this.zonesService.isPointRestricted(dto.pickup);
    if (restrictedPickup.restricted) {
      throw new AppException(
        'ZONE_RESTRICTED',
        undefined,
        `Keke no fit pick up for dis zone: ${restrictedPickup.zoneName}`,
      );
    }
    const restrictedDest = await this.zonesService.isPointRestricted(dto.destination);
    if (restrictedDest.restricted) {
      throw new AppException(
        'ZONE_RESTRICTED',
        undefined,
        `Keke no fit drop off for dis zone: ${restrictedDest.zoneName}`,
      );
    }

    const permittedPickup = await this.isInServiceArea(dto.pickup);
    const permittedDest = await this.isInServiceArea(dto.destination);
    if (!permittedPickup && !permittedDest) {
      throw new AppException('INVALID_ZONE');
    }

    const { distanceKm, durationMin } = await this.pricingService.resolveRouteMetrics(
      dto.pickup,
      dto.destination,
    );

    let estimate = await this.pricingService.estimateFare({
      vehicleType: dto.vehicleType,
      distanceKm,
      durationMin,
      pickup: dto.pickup,
      isShared: dto.isShared,
      rideMode: dto.rideMode,
    });

    if (dto.promoCode) {
      const promo = options.redeemPromo
        ? await this.promosService.validateAndRedeem(dto.promoCode)
        : await this.promosService.validate(dto.promoCode);
      const originalTotalFare = estimate.totalFare;
      const discounted = this.promosService.applyDiscount(promo, originalTotalFare);
      estimate = {
        ...estimate,
        totalFare: discounted.totalFare,
        quotedFare: originalTotalFare,
        originalTotalFare,
        promoDiscount: discounted.discountAmount,
        promoCode: discounted.promoCode,
      };
    }

    return { distanceKm, durationMin, estimate };
  }

  async quoteTrip(_passengerId: string, dto: RequestTripRequest): Promise<QuoteTripResponse> {
    const prepared = await this.prepareTripRequest(dto, { redeemPromo: false });
    const candidates = await this.matchingService.findCandidates(dto.pickup, dto.vehicleType);
    const nearbyDrivers = candidates.length;
    const closest = candidates[0];
    const etaMin = closest
      ? Math.max(1, Math.round((closest.distanceMeters / 1000) * 2.5))
      : null;
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();

    return {
      quoteId: crypto.randomUUID(),
      estimate: prepared.estimate,
      supply: {
        nearbyDrivers,
        available: nearbyDrivers > 0,
        radiusKm: 5,
        etaMin,
      },
      expiresAt,
    };
  }

  async findSharedRideMatches(
    pickup: LatLng,
    destination: LatLng,
    vehicleType: VehicleType = VehicleType.KEKE,
  ) {
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT
        t.id,
        t.driver_id AS "driverId",
        t.total_fare AS "totalFare",
        ST_DistanceSphere(
          t.pickup_location::geometry,
          ST_SetSRID(ST_MakePoint(${pickup.lng}, ${pickup.lat}), 4326)
        ) AS "pickupDistanceMeters",
        ST_DistanceSphere(
          t.destination_location::geometry,
          ST_SetSRID(ST_MakePoint(${destination.lng}, ${destination.lat}), 4326)
        ) AS "destinationDistanceMeters",
        d.name AS "driverName"
      FROM trips t
      LEFT JOIN drivers d ON d.id = t.driver_id
      WHERE t.is_shared = true
        AND t.status = 'active'
        AND t.vehicle_type = ${vehicleType}::\"VehicleType\"
        AND t.driver_id IS NOT NULL
        AND ST_DistanceSphere(
          t.pickup_location::geometry,
          ST_SetSRID(ST_MakePoint(${pickup.lng}, ${pickup.lat}), 4326)
        ) <= 1500
        AND ST_DistanceSphere(
          t.destination_location::geometry,
          ST_SetSRID(ST_MakePoint(${destination.lng}, ${destination.lat}), 4326)
        ) <= 1500
      ORDER BY "pickupDistanceMeters" ASC
      LIMIT 3;
    `;

    const matches = rows.map((row) => ({
      rideId: row.id,
      pickupDistanceM: Math.round(Number(row.pickupDistanceMeters)),
      destinationDistanceM: Math.round(Number(row.destinationDistanceMeters)),
      driverName: row.driverName,
      currentPassengers: 1,
      fareShare: Math.round(Number(row.totalFare ?? 0) / 2),
    }));

    return {
      matches,
      bestMatch: matches[0] ?? null,
    };
  }

  async joinSharedRide(passengerId: string, rideId: string) {
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT
        t.id,
        t.driver_id AS "driverId",
        t.pickup_address AS "pickupAddress",
        ST_X(t.pickup_location::geometry) AS "pickupLng",
        ST_Y(t.pickup_location::geometry) AS "pickupLat",
        t.destination_address AS "destinationAddress",
        ST_X(t.destination_location::geometry) AS "destinationLng",
        ST_Y(t.destination_location::geometry) AS "destinationLat",
        t.vehicle_type AS "vehicleType",
        t.total_fare AS "totalFare"
      FROM trips t
      WHERE t.id = ${rideId}::uuid
        AND t.is_shared = true
        AND t.status = 'active'
      LIMIT 1;
    `;
    const sharedRide = rows[0];
    if (!sharedRide) {
      throw new AppException('NOT_FOUND', undefined, 'Shared ride not found or no longer active');
    }
    if (!sharedRide.driverId) {
      throw new AppException('VALIDATION_ERROR', undefined, 'Shared ride has no assigned driver');
    }

    const tripId = crypto.randomUUID();
    const fareShare = Math.round(Number(sharedRide.totalFare ?? 0) / 2);

    await this.prisma.$executeRaw`
      INSERT INTO trips (
        id,
        passenger_id,
        driver_id,
        pickup_location,
        pickup_address,
        destination_location,
        destination_address,
        vehicle_type,
        status,
        base_fare,
        distance_fare,
        time_fare,
        raw_fare,
        quoted_fare,
        minimum_fare,
        minimum_fare_applied,
        surge_multiplier,
        mode_multiplier,
        pricing_version,
        total_fare,
        payment_method,
        payment_status,
        ride_share_partner_id,
        is_shared,
        ride_mode,
        created_at
      ) VALUES (
        ${tripId}::uuid,
        ${passengerId}::uuid,
        ${sharedRide.driverId}::uuid,
        ST_SetSRID(ST_MakePoint(${Number(sharedRide.pickupLng)}, ${Number(sharedRide.pickupLat)}), 4326)::geography,
        ${sharedRide.pickupAddress},
        ST_SetSRID(ST_MakePoint(${Number(sharedRide.destinationLng)}, ${Number(sharedRide.destinationLat)}), 4326)::geography,
        ${sharedRide.destinationAddress},
        ${sharedRide.vehicleType}::\"VehicleType\",
        'matched'::\"TripStatus\",
        ${fareShare},
        0,
        0,
        ${fareShare},
        ${fareShare},
        0,
        false,
        1.0,
        1.0,
        'shared-join',
        ${fareShare},
        'cash'::\"PaymentMethod\",
        'pending'::\"PaymentStatus\",
        ${rideId}::uuid,
        true,
        'share'::\"RideMode\",
        NOW()
      );
    `;

    const trip = await this.getTrip(tripId);
    if (!trip) {
      throw new AppException('INTERNAL_ERROR', undefined, 'Failed to create shared ride');
    }

    return {
      ride: trip,
      sharedWith: rideId,
      fareSplit: true,
    };
  }

  async getFareNegotiationSuggestions(estimatedFare: number) {
    const config = await this.getNegotiationConfig();
    return {
      suggestions: this.getPassengerNegotiationSuggestions(estimatedFare, config),
      config,
    };
  }
}

