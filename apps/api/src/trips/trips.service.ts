import { Injectable, Inject, forwardRef, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ZonesService } from '../zones/zones.service';
import { PricingService } from '../pricing/pricing.service';
import { MatchingService } from '../matching/matching.service';
import { EventsGateway } from '../realtime/events.gateway';
import { PaymentService } from '../payments/payment.service';
import { PushService } from '../push/push.service';
import { PromosService } from '../promos/promos.service';
import { MapsService } from '../maps/maps.service';
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
  city?: string; // P0: city derived from pickup location for matching filter
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
    private readonly mapsService: MapsService,
  ) {}

  /**
   * Envelope checks for regions where HiGO operates. A point passes if it
   * falls inside any supported region OR inside a seeded permitted zone.
   * FCT bounds cover all 6 Area Councils; Delta covers the Warri metropolitan
   * area (Warri, Effurun, Udu, Sapele axis).
   */
  private isWithinFct(point: LatLng): boolean {
    return point.lat >= 8.35 && point.lat <= 9.35 && point.lng >= 6.75 && point.lng <= 7.85;
  }

  private isWithinDelta(point: LatLng): boolean {
    // Whole Delta State envelope — covers Warri, Asaba, Abraka, Agbor, Eku, Ozoro, Oleh, Emevor, Ughelli
    return point.lat >= 5.20 && point.lat <= 6.40 && point.lng >= 5.50 && point.lng <= 6.90;
  }

  private async isInServiceArea(point: LatLng): Promise<boolean> {
    if (await this.zonesService.isPointInPermittedZone(point)) {
      return true;
    }
    return this.isWithinFct(point) || this.isWithinDelta(point);
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

  private async generateAutoResponses(
    vehicleType: VehicleType,
    pickup: LatLng,
    clampedOffer: number,
  ): Promise<DriverNegotiationResponseRow[]> {
    const drivers = await this.prisma.driver.findMany({
      where: {
        isOnline: true,
        vehicleType,
        kycStatus: 'approved',
        isSuspended: false,
      },
    });

    const autoResponses: DriverNegotiationResponseRow[] = [];
    for (const driver of drivers) {
      if (!driver.currentLocation) continue;
      // Parse PostGIS geography point: "lat,lng" or use raw coordinates
      let driverLat: number;
      let driverLng: number;
      try {
        const loc = driver.currentLocation as any;
        if (typeof loc === 'object' && loc.coordinates) {
          // GeoJSON format: [lng, lat]
          driverLng = loc.coordinates[0];
          driverLat = loc.coordinates[1];
        } else if (typeof loc === 'string') {
          // WKT format
          const match = loc.match(/[\d.-]+/g);
          if (!match || match.length < 2) continue;
          driverLng = parseFloat(match[0]);
          driverLat = parseFloat(match[1]);
        } else {
          continue;
        }
      } catch {
        continue;
      }

      const maxDist = Number(driver.maxNegotiationDistKm || 5);
      const maxPickupTime = driver.maxPickupTimeMin || 8;
      const dLat = (driverLat - pickup.lat) * 111;
      const dLng = (driverLng - pickup.lng) * 111 * Math.cos((pickup.lat * Math.PI) / 180);
      const dkm = Math.sqrt(dLat * dLat + dLng * dLng);
      if (dkm > maxDist) continue;
      const eta = Math.max(1, Math.ceil(dkm / 0.4));
      if (eta > maxPickupTime) continue;

      if (driver.autoAcceptThreshold && clampedOffer >= Number(driver.autoAcceptThreshold)) {
        autoResponses.push({
          driverId: driver.id,
          driverName: driver.name,
          driverRating: Number(driver.ratingAvg || 5),
          driverEtaMin: eta,
          driverVerified: driver.kycStatus === 'approved',
          responseType: 'accept' as const,
          counterAmount: null,
          respondedAt: new Date().toISOString(),
        });
      } else if (
        driver.autoCounterThreshold &&
        clampedOffer < Number(driver.autoCounterThreshold) &&
        driver.autoCounterAmount
      ) {
        autoResponses.push({
          driverId: driver.id,
          driverName: driver.name,
          driverRating: Number(driver.ratingAvg || 5),
          driverEtaMin: eta,
          driverVerified: driver.kycStatus === 'approved',
          responseType: 'counter' as const,
          counterAmount: this.clampFare(Number(driver.autoCounterAmount), await this.getNegotiationConfig()),
          respondedAt: new Date().toISOString(),
        });
      }
    }

    return autoResponses;
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
      city: row.city ?? null,
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
        city,
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

    let city: string | undefined;
    try {
      const geo = await this.mapsService.reverseGeocode(dto.pickup.lat, dto.pickup.lng);
      city = geo?.city;
    } catch {
      this.logger.warn(`Reverse geocode failed for ${dto.pickup.lat},${dto.pickup.lng}; falling back to global pricing`);
    }

    let estimate = await this.pricingService.estimateFare({
      vehicleType: dto.vehicleType,
      distanceKm,
      durationMin,
      pickup: dto.pickup,
      isShared: dto.isShared,
      rideMode: dto.rideMode,
      city,
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

    return { distanceKm, durationMin, estimate, city };
  }

  async quoteTrip(_passengerId: string, dto: RequestTripRequest): Promise<QuoteTripResponse> {
    const prepared = await this.prepareTripRequest(dto, { redeemPromo: false });
    // P0: Pass city to findCandidates for city-based driver filtering
    const candidates = await this.matchingService.findCandidates(dto.pickup, dto.vehicleType, prepared.city);
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
        AND t.vehicle_type = ${vehicleType}::"VehicleType"
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
        ${sharedRide.vehicleType}::"VehicleType",
        'matched'::"TripStatus",
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
        'cash'::"PaymentMethod",
        'pending'::"PaymentStatus",
        ${rideId}::uuid,
        true,
        'share'::"RideMode",
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

  async createFareNegotiation(
    passengerId: string,
    dto: {
      passengerName?: string;
      pickupAddress: string;
      pickup: LatLng;
      destinationAddress: string;
      destination: LatLng;
      vehicleType: VehicleType;
      estimatedFare: number;
      distanceKm?: number;
      durationMin?: number;
      passengerOffer: number;
    },
  ): Promise<{ negotiation: FareNegotiationResponse }> {
    const config = await this.getNegotiationConfig();
    if (!config.isEnabled) {
      throw new AppException('FORBIDDEN', undefined, 'Negotiation is disabled');
    }

    const passenger = await this.prisma.user.findUnique({ where: { id: passengerId } });
    const clampedOffer = this.clampFare(dto.passengerOffer, config);
    const negotiation = await this.prisma.fareNegotiation.create({
      data: {
        passengerId,
        passengerName: dto.passengerName ?? passenger?.name ?? null,
        pickupAddress: dto.pickupAddress,
        pickupLat: dto.pickup.lat,
        pickupLng: dto.pickup.lng,
        destinationAddress: dto.destinationAddress,
        destinationLat: dto.destination.lat,
        destinationLng: dto.destination.lng,
        vehicleType: dto.vehicleType,
        estimatedFare: dto.estimatedFare,
        passengerOffer: clampedOffer,
        distanceKm: dto.distanceKm ?? null,
        durationMin: dto.durationMin ?? null,
        currentRound: 1,
        maxRounds: config.maxRounds,
        expiresAt: new Date(Date.now() + config.maxTimeSec * 1000),
      },
    });

    // Auto-respond from nearby drivers with auto-accept/counter settings
    try {
      const autoResponses = await this.generateAutoResponses(
        dto.vehicleType,
        dto.pickup,
        clampedOffer,
      );
      if (autoResponses.length > 0) {
        await this.prisma.fareNegotiation.update({
          where: { id: negotiation.id },
          data: { driverResponses: autoResponses as any },
        });
        return { negotiation: this.mapNegotiation({ ...negotiation, driverResponses: autoResponses as any }) };
      }
    } catch {
      // Auto-respond is best-effort; don't fail the negotiation creation
    }

    return { negotiation: this.mapNegotiation(negotiation) };
  }

  async respondToFareNegotiation(
    user: AuthUser,
    negotiationId: string,
    dto: {
      action: 'driver_respond' | 'counter_offer' | 'select_driver' | 'cancel' | 'get_state';
      responseType?: 'accept' | 'reject' | 'counter';
      counterAmount?: number;
      newOffer?: number;
      driverId?: string;
    },
  ): Promise<{ negotiation: FareNegotiationResponse; rideId?: string; suggestions?: unknown }> {
    const negotiation = await this.prisma.fareNegotiation.findUnique({
      where: { id: negotiationId },
    });
    if (!negotiation) {
      throw new AppException('NOT_FOUND', undefined, 'Negotiation not found');
    }

    if (dto.action === 'get_state') {
      const current = await this.expireNegotiationIfNeeded(negotiationId);
      const config = await this.getNegotiationConfig();
      const trip = await this.prisma.trip.findFirst({ where: { negotiationId } });
      return {
        negotiation: this.mapNegotiation(current),
        suggestions: this.getDriverNegotiationSuggestions(
          current.passengerOffer,
          current.estimatedFare,
          config,
        ),
        rideId: trip?.id,
      };
    }

    if (dto.action === 'cancel') {
      this.assertNegotiationOwner(negotiation, user);
      const updated = await this.prisma.fareNegotiation.update({
        where: { id: negotiationId },
        data: { status: 'cancelled', closedReason: 'cancelled' },
      });
      return { negotiation: this.mapNegotiation(updated) };
    }

    const active = await this.expireNegotiationIfNeeded(negotiationId);
    if (active.status !== 'active') {
      throw new AppException('VALIDATION_ERROR', undefined, 'Negotiation no longer active');
    }

    if (dto.action === 'counter_offer') {
      this.assertNegotiationOwner(active, user);
      if (active.currentRound >= active.maxRounds) {
        throw new AppException('VALIDATION_ERROR', undefined, 'Maximum rounds reached');
      }
      if (!dto.newOffer) {
        throw new AppException('VALIDATION_ERROR', undefined, 'Missing new offer');
      }
      const config = await this.getNegotiationConfig();
      const clampedOffer = this.clampFare(dto.newOffer, config);
      const updated = await this.prisma.fareNegotiation.update({
        where: { id: negotiationId },
        data: {
          passengerOffer: clampedOffer,
          currentRound: active.currentRound + 1,
          driverResponses: [],
          expiresAt: new Date(Date.now() + config.maxTimeSec * 1000),
        },
      });

      // Re-run auto-respond for the new offer
      try {
        const autoResponses = await this.generateAutoResponses(
          active.vehicleType as VehicleType,
          { lat: Number(active.pickupLat), lng: Number(active.pickupLng) },
          clampedOffer,
        );
        if (autoResponses.length > 0) {
          const refetched = await this.prisma.fareNegotiation.findUnique({ where: { id: negotiationId } });
          await this.prisma.fareNegotiation.update({
            where: { id: negotiationId },
            data: { driverResponses: autoResponses as any },
          });
          return { negotiation: this.mapNegotiation({ ...refetched!, driverResponses: autoResponses as any }) };
        }
      } catch {
        // Auto-respond is best-effort
      }

      return { negotiation: this.mapNegotiation(updated) };
    }

    if (dto.action === 'driver_respond') {
      if (user.type !== 'driver') {
        throw new AppException('FORBIDDEN', undefined, 'Only drivers can respond to negotiations');
      }
      if (!dto.responseType) {
        throw new AppException('VALIDATION_ERROR', undefined, 'Missing response type');
      }
      const driver = await this.prisma.driver.findUnique({ where: { id: user.sub } });
      if (!driver) {
        throw new AppException('NOT_FOUND', undefined, 'Driver profile not found');
      }
      const config = await this.getNegotiationConfig();
      const response: DriverNegotiationResponseRow = {
        driverId: driver.id,
        driverName: driver.name,
        driverRating: Number(driver.ratingAvg || 5),
        driverEtaMin: 5,
        driverVerified: driver.kycStatus === 'approved',
        responseType: dto.responseType,
        counterAmount:
          dto.responseType === 'counter'
            ? this.clampFare(dto.counterAmount ?? 0, config)
            : null,
        respondedAt: new Date().toISOString(),
      };
      const existing = this.mapNegotiation(active).driverResponses;
      const nextResponses = [
        ...existing.filter((item) => item.driverId !== driver.id),
        response,
      ];
      const updated = await this.prisma.fareNegotiation.update({
        where: { id: negotiationId },
        data: { driverResponses: nextResponses as any },
      });
      return { negotiation: this.mapNegotiation(updated) };
    }

    if (dto.action === 'select_driver') {
      this.assertNegotiationOwner(active, user);
      if (!dto.driverId) {
        throw new AppException('VALIDATION_ERROR', undefined, 'Missing driver ID');
      }
      const responses = this.mapNegotiation(active).driverResponses;
      const response = responses.find((item) => item.driverId === dto.driverId);
      if (!response || response.responseType === 'reject') {
        throw new AppException('NOT_FOUND', undefined, 'Acceptable driver response not found');
      }
      const finalFare =
        response.responseType === 'accept' ? active.passengerOffer : response.counterAmount;
      if (!finalFare) {
        throw new AppException('VALIDATION_ERROR', undefined, 'Selected response has no fare');
      }

      const durationSec = Math.round(
        (Date.now() - active.createdAt.getTime()) / 1000,
      );
      const updated = await this.prisma.fareNegotiation.update({
        where: { id: negotiationId },
        data: {
          status: 'accepted',
          selectedDriverId: dto.driverId,
          selectedDriverName: response.driverName,
          finalFare,
          closedReason: 'accepted',
          negotiationDurationSec: durationSec,
        },
      });

      const tripId = await this.createTripFromAcceptedNegotiation(updated, response, finalFare);
      return { negotiation: this.mapNegotiation(updated), rideId: tripId };
    }

    throw new AppException('VALIDATION_ERROR', undefined, 'Unknown negotiation action');
  }

  private assertNegotiationOwner(negotiation: { passengerId: string }, user: AuthUser): void {
    if (user.type === 'admin') return;
    if (user.type === 'passenger' && user.sub === negotiation.passengerId) return;
    throw new AppException('FORBIDDEN', undefined, 'You cannot modify this negotiation');
  }

  private async expireNegotiationIfNeeded(negotiationId: string) {
    const negotiation = await this.prisma.fareNegotiation.findUniqueOrThrow({
      where: { id: negotiationId },
    });
    if (negotiation.status === 'active' && negotiation.expiresAt < new Date()) {
      return this.prisma.fareNegotiation.update({
        where: { id: negotiationId },
        data: { status: 'expired', closedReason: 'expired' },
      });
    }
    return negotiation;
  }

  private async createTripFromAcceptedNegotiation(
    negotiation: any,
    response: DriverNegotiationResponseRow,
    finalFare: number,
  ): Promise<string> {
    const driver = await this.prisma.driver.findUnique({ where: { id: response.driverId } });
    const tripId = crypto.randomUUID();
    const rawFare = negotiation.estimatedFare;
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
        distance_km,
        duration_min,
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
        is_shared,
        ride_mode,
        negotiation_id,
        created_at
      ) VALUES (
        ${tripId}::uuid,
        ${negotiation.passengerId}::uuid,
        ${response.driverId}::uuid,
        ST_SetSRID(ST_MakePoint(${Number(negotiation.pickupLng)}, ${Number(negotiation.pickupLat)}), 4326)::geography,
        ${negotiation.pickupAddress},
        ST_SetSRID(ST_MakePoint(${Number(negotiation.destinationLng)}, ${Number(negotiation.destinationLat)}), 4326)::geography,
        ${negotiation.destinationAddress},
        ${negotiation.vehicleType}::"VehicleType",
        'matched'::"TripStatus",
        ${negotiation.distanceKm ?? null},
        ${negotiation.durationMin ?? null},
        ${rawFare},
        0,
        0,
        ${rawFare},
        ${finalFare},
        0,
        false,
        1.0,
        1.0,
        'negotiated',
        ${finalFare},
        'cash'::"PaymentMethod",
        'pending'::"PaymentStatus",
        false,
        'negotiate'::"RideMode",
        ${negotiation.id}::uuid,
        NOW()
      );
    `;

    if (driver) {
      this.eventsGateway.server
        .to(`passenger:${negotiation.passengerId}`)
        .emit(SOCKET_EVENTS.TRIP_MATCHED, {
          tripId,
          driverId: response.driverId,
          driverDetails: {
            driverId: driver.id,
            name: driver.name,
            phone: driver.phone,
            avatarUrl: driver.avatarUrl,
            vehiclePlate: driver.vehiclePlate,
            vehicleModel: driver.vehicleModel,
            vehicleColor: driver.vehicleColor,
            ratingAvg: Number(driver.ratingAvg),
            totalTrips: driver.totalTrips,
          },
          eta: response.driverEtaMin,
        });
    }

    return tripId;
  }

  async requestTrip(passengerId: string, dto: RequestTripRequest): Promise<RequestTripResponse> {
    // Auto-cancel stale trips that are stuck in active/requested/matched for > 30 minutes
    // This prevents TRIP_ALREADY_ACTIVE from permanently blocking a passenger.
    const staleThreshold = new Date(Date.now() - 30 * 60 * 1000);
    const staleCancelled = await this.prisma.$executeRaw`
      UPDATE trips SET status = 'cancelled'::"TripStatus",
        cancel_reason = 'Auto-cancelled: stale trip cleanup',
        cancelled_at = NOW()
      WHERE passenger_id = ${passengerId}::uuid
        AND status::text IN ('requested', 'matched', 'en_route', 'active')
        AND created_at < ${staleThreshold}
    `;
    if (staleCancelled > 0) {
      this.logger.warn(`Auto-cancelled ${staleCancelled} stale trip(s) for passenger ${passengerId}`);
    }

    const activeTripRows = await this.prisma.$queryRaw<any[]>`
      SELECT id FROM trips
      WHERE passenger_id = ${passengerId}::uuid
        AND status::text IN ('requested', 'matched', 'en_route', 'active')
      LIMIT 1;
    `;
    if (activeTripRows.length > 0) {
      throw new AppException('TRIP_ALREADY_ACTIVE');
    }

    const { distanceKm, durationMin, estimate, city: tripCity } = await this.prepareTripRequest(dto, {
      redeemPromo: true,
    });

    const tripId = crypto.randomUUID();

    // P0: Store city on trip for matching filter

    await this.prisma.$executeRaw`
      INSERT INTO trips (
        id,
        passenger_id,
        pickup_location,
        pickup_address,
        destination_location,
        destination_address,
        vehicle_type,
        status,
        distance_km,
        duration_min,
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
        customer_booking_fee,
        customer_statutory_levy,
        total_fare,
        payment_method,
        payment_status,
        promo_code,
        discount_amount,
        is_shared,
        ride_mode,
        scheduled_for,
        is_scheduled,
        city,
        created_at
      ) VALUES (
        ${tripId}::uuid,
        ${passengerId}::uuid,
        ST_SetSRID(ST_MakePoint(${dto.pickup.lng}, ${dto.pickup.lat}), 4326)::geography,
        ${dto.pickupAddress},
        ST_SetSRID(ST_MakePoint(${dto.destination.lng}, ${dto.destination.lat}), 4326)::geography,
        ${dto.destinationAddress},
        ${dto.vehicleType}::"VehicleType",
        'requested'::"TripStatus",
        ${distanceKm},
        ${durationMin},
        ${estimate.baseFare},
        ${estimate.distanceFare},
        ${estimate.timeFare},
        ${estimate.rawFare},
        ${estimate.quotedFare},
        ${estimate.minimumFare},
        ${estimate.minimumFareApplied},
        ${estimate.surgeMultiplier},
        ${estimate.modeMultiplier},
        ${estimate.pricingVersion},
        ${estimate.customerBookingFee},
        ${estimate.customerStatutoryLevy},
        ${estimate.totalFare},
        ${dto.paymentMethod}::"PaymentMethod",
        'pending'::"PaymentStatus",
        ${estimate.promoCode ?? null},
        ${estimate.promoDiscount ?? 0},
        ${dto.isShared ?? false},
        ${estimate.rideMode}::"RideMode",
        ${dto.scheduledFor ? new Date(dto.scheduledFor) : null},
        ${Boolean(dto.scheduledFor || estimate.rideMode === RideMode.SCHEDULE_FLEX || estimate.rideMode === RideMode.SCHEDULE_EXACT)},
        ${tripCity ?? null},
        NOW()
      );
    `;

    const trip = await this.getTrip(tripId);
    if (!trip) {
      throw new AppException('INTERNAL_ERROR', undefined, 'Failed to create trip');
    }

    this.dispatchRequestedTrip(tripId);

    this.logger.log(`Trip ${tripId} created for passenger ${passengerId}: status=requested, dispatch initiated`);

    return {
      trip,
      estimate,
    };
  }

  dispatchRequestedTrip(tripId: string): void {
    this.logger.log(`Dispatch requested for trip ${tripId}`);
    this.matchingService.dispatch(tripId).catch((err) => {
      this.logger.error(`Matching dispatch failed for trip ${tripId}: ${err.message}`, err.stack);
    });
  }

  async cancelTrip(tripId: string, by: 'passenger' | 'driver', reason: string): Promise<CancelTripResponse> {
    const originalTrip = await this.getTrip(tripId);
    const trip = await this.transition(tripId, TripStatus.CANCELLED, by);

    if (originalTrip && originalTrip.driverId) {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const repeatedCancelCount = await this.prisma.trip.count({
        where: {
          passengerId: originalTrip.passengerId,
          driverId: originalTrip.driverId,
          status: 'cancelled',
          cancelledAt: { gte: oneDayAgo },
        },
      });

      if (repeatedCancelCount >= 3) {
        await this.prisma.dispute.create({
          data: {
            id: crypto.randomUUID(),
            tripId: tripId,
            raisedBy: 'admin',
            type: 'disintermediation_flag',
            description: `Potential off-platform agreement: Passenger ${originalTrip.passengerId} and Driver ${originalTrip.driverId} have cancelled ${repeatedCancelCount} trips together in the last 24 hours.`,
            status: 'open',
          },
        });
        this.logger.warn(`Disintermediation flag created for Passenger: ${originalTrip.passengerId}, Driver: ${originalTrip.driverId}`);
      }
    }

    return {
      trip,
      cancellationFee: 0,
    };
  }

  async getTripStatus(tripId: string): Promise<GetTripStatusResponse> {
    const trip = await this.getTrip(tripId);
    if (!trip) {
      throw new AppException('NOT_FOUND', undefined, 'Trip not found');
    }

    let driverDetails: any;
    let driverLocation: any;

    if (trip.driverId) {
      const driver = await this.prisma.driver.findUnique({
        where: { id: trip.driverId },
      });
      if (driver) {
        driverDetails = {
          driverId: driver.id,
          name: driver.name,
          phone: driver.phone,
          avatarUrl: driver.avatarUrl,
          vehiclePlate: driver.vehiclePlate,
          vehicleModel: driver.vehicleModel,
          vehicleColor: driver.vehicleColor,
          ratingAvg: Number(driver.ratingAvg),
          totalTrips: driver.totalTrips,
        };

        const locStr = await this.redis.get(`loc:driver:${driver.id}`);
        if (locStr) {
          const loc = JSON.parse(locStr);
          driverLocation = {
            lat: loc.lat,
            lng: loc.lng,
            bearing: loc.bearing,
            etaMin: 5,
          };
        }
      }
    }

    return {
      tripId,
      status: trip.status,
      paymentStatus: trip.paymentStatus,
      driver: driverDetails,
      driverLocation,
    };
  }

  async rateDriver(tripId: string, rating: number, comment?: string): Promise<RateResponse> {
    const trip = await this.getTrip(tripId);
    if (!trip) throw new AppException('NOT_FOUND', undefined, 'Trip not found');
    if (!trip.driverId) throw new AppException('VALIDATION_ERROR', undefined, 'No driver assigned to this trip');

    await this.prisma.trip.update({
      where: { id: tripId },
      data: { driverRating: rating },
    });

    const ratingsResult = await this.prisma.trip.aggregate({
      where: { driverId: trip.driverId, driverRating: { not: null } },
      _avg: { driverRating: true },
    });

    const newAvg = ratingsResult._avg.driverRating ? Number(ratingsResult._avg.driverRating) : rating;

    await this.prisma.driver.update({
      where: { id: trip.driverId },
      data: {
        ratingAvg: newAvg,
        totalTrips: { increment: 1 },
      },
    });

    return {
      recorded: true,
      newAverage: newAvg,
    };
  }

  async ratePassenger(tripId: string, rating: number, comment?: string): Promise<RateResponse> {
    const trip = await this.getTrip(tripId);
    if (!trip) throw new AppException('NOT_FOUND', undefined, 'Trip not found');

    await this.prisma.trip.update({
      where: { id: tripId },
      data: { passengerRating: rating },
    });

    const ratingsResult = await this.prisma.trip.aggregate({
      where: { passengerId: trip.passengerId, passengerRating: { not: null } },
      _avg: { passengerRating: true },
    });

    const newAvg = ratingsResult._avg.passengerRating ? Number(ratingsResult._avg.passengerRating) : rating;

    await this.prisma.user.update({
      where: { id: trip.passengerId },
      data: {
        ratingAvg: newAvg,
        totalTrips: { increment: 1 },
      },
    });

    return {
      recorded: true,
      newAverage: newAvg,
    };
  }

  async transition(
    tripId: string,
    to: TripStatus,
    actor: 'passenger' | 'driver' | 'system',
    driverId?: string,
  ): Promise<Trip> {
    const trip = await this.getTrip(tripId);
    if (!trip) {
      throw new AppException('NOT_FOUND', undefined, 'Trip not found');
    }

    const currentStatus = trip.status;

    if (!validateTransition(currentStatus, to)) {
      throw new AppException(
        'VALIDATION_ERROR',
        undefined,
        `Cannot transition trip from ${currentStatus} to ${to}`,
      );
    }

    // Atomic update: status + all associated fields in ONE statement.
    // The CAS WHERE guard prevents race conditions — only one concurrent
    // transition can win. If a crash occurs between writes, the row is
    // consistent because everything is a single SQL statement.
    let updateResult: number;

    if (to === TripStatus.MATCHED) {
      if (!driverId) {
        throw new AppException('VALIDATION_ERROR', undefined, 'Driver ID is required for matching');
      }
      updateResult = await this.prisma.$executeRaw`
        UPDATE trips SET status = ${to}::"TripStatus", driver_id = ${driverId}::uuid
        WHERE id = ${tripId}::uuid AND status = ${currentStatus}::"TripStatus"
      `;
    } else if (to === TripStatus.ACTIVE) {
      updateResult = await this.prisma.$executeRaw`
        UPDATE trips SET status = ${to}::"TripStatus", started_at = NOW()
        WHERE id = ${tripId}::uuid AND status = ${currentStatus}::"TripStatus"
      `;
    } else if (to === TripStatus.COMPLETED) {
      const paymentStatus = trip.paymentMethod === PaymentMethod.CASH ? 'released' : 'held';
      updateResult = await this.prisma.$executeRaw`
        UPDATE trips SET status = ${to}::"TripStatus", completed_at = NOW(),
          payment_status = ${paymentStatus}::"PaymentStatus"
        WHERE id = ${tripId}::uuid AND status = ${currentStatus}::"TripStatus"
      `;
    } else if (to === TripStatus.CANCELLED) {
      const cancelReason = `${actor}: cancelled`;
      updateResult = await this.prisma.$executeRaw`
        UPDATE trips SET status = ${to}::"TripStatus", cancelled_at = NOW(),
          cancel_reason = ${cancelReason}
        WHERE id = ${tripId}::uuid AND status = ${currentStatus}::"TripStatus"
      `;
    } else {
      // Simple status-only update (e.g. MATCHED → ARRIVED)
      updateResult = await this.prisma.$executeRaw`
        UPDATE trips SET status = ${to}::"TripStatus"
        WHERE id = ${tripId}::uuid AND status = ${currentStatus}::"TripStatus"
      `;
    }

    if (updateResult === 0) {
      throw new AppException(
        'VALIDATION_ERROR',
        undefined,
        `Trip ${tripId} was concurrently modified — cannot transition from ${currentStatus} to ${to}`,
      );
    }

    const updatedTrip = await this.getTrip(tripId);
    if (!updatedTrip) {
      throw new AppException('INTERNAL_ERROR', undefined, 'Failed to fetch updated trip');
    }

    if (to === TripStatus.MATCHED) {
      const driver = await this.prisma.driver.findUnique({
        where: { id: driverId! },
      });

      const eta = 5;

      const payload: TripMatchedPayload = {
        tripId,
        driverId: driverId!,
        driverDetails: {
          driverId: driverId!,
          name: driver!.name,
          phone: driver!.phone,
          avatarUrl: driver!.avatarUrl,
          vehiclePlate: driver!.vehiclePlate,
          vehicleModel: driver!.vehicleModel,
          vehicleColor: driver!.vehicleColor,
          ratingAvg: Number(driver!.ratingAvg),
          totalTrips: driver!.totalTrips,
        },
        eta,
      };

      this.eventsGateway.server
        .to(`passenger:${trip.passengerId}`)
        .emit(SOCKET_EVENTS.TRIP_MATCHED, payload);

      this.eventsGateway.server
        .to(`trip:${tripId}`)
        .emit(SOCKET_EVENTS.TRIP_MATCHED, payload);

      void this.pushService.sendToPassenger(trip.passengerId, {
        title: 'Driver matched',
        body: `${driver!.name} is on the way`,
        data: {
          type: 'trip:matched',
          tripId,
          driverId: driverId!,
        },
      });
    } else if (to === TripStatus.ARRIVED) {
      this.eventsGateway.server
        .to(`trip:${tripId}`)
        .emit(SOCKET_EVENTS.TRIP_DRIVER_ARRIVED, { tripId });

      void this.pushService.sendToPassenger(trip.passengerId, {
        title: 'Driver has arrived',
        body: 'Your driver is at the pickup location. Please come outside.',
        data: { tripId, type: 'driver_arrived' },
      });
    } else if (to === TripStatus.EN_ROUTE) {
      this.eventsGateway.server
        .to(`trip:${tripId}`)
        .emit(SOCKET_EVENTS.TRIP_DRIVER_ARRIVED, { tripId });
    } else if (to === TripStatus.ACTIVE) {
      this.eventsGateway.server
        .to(`trip:${tripId}`)
        .emit(SOCKET_EVENTS.TRIP_STARTED, {
          tripId,
          startedAt: updatedTrip.startedAt!,
        });
    } else if (to === TripStatus.COMPLETED) {
      if (updatedTrip.paymentStatus === 'held') {
        await this.paymentService.releaseEscrow(tripId);
      }

      this.eventsGateway.server
        .to(`trip:${tripId}`)
        .emit(SOCKET_EVENTS.TRIP_COMPLETED, {
          tripId,
          fare: updatedTrip.totalFare,
          paymentRef: updatedTrip.paystackReference,
          completedAt: updatedTrip.completedAt!,
        });

      void this.pushService.sendToPassenger(trip.passengerId, {
        title: 'Trip completed',
        body: `Your trip is complete. Fare: ₦${(updatedTrip.totalFare ?? 0).toLocaleString()}`,
        data: { tripId, type: 'trip_completed', fare: String(updatedTrip.totalFare ?? 0) },
      });
    } else if (to === TripStatus.CANCELLED) {
      this.eventsGateway.server
        .to(`trip:${tripId}`)
        .emit(SOCKET_EVENTS.TRIP_CANCELLED, {
          tripId,
          reason: updatedTrip.cancelReason || '',
          cancelledBy: actor,
        });

      // Also notify all offered drivers who haven't accepted yet
      const offeredDriversKey = `dispatch:offered_drivers:${tripId}`;
      const offeredDriverIds = await this.redis.raw.smembers(offeredDriversKey);
      for (const driverId of offeredDriverIds) {
        this.eventsGateway.server
          .to(`driver:${driverId}`)
          .emit(SOCKET_EVENTS.TRIP_CANCELLED, {
            tripId,
            reason: updatedTrip.cancelReason || '',
            cancelledBy: actor,
          });
      }
    }

    return updatedTrip;
  }
}
