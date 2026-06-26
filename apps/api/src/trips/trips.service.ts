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
import * as crypto from 'crypto';

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
    private readonly paymentService: PaymentService,
    private readonly pushService: PushService,
    private readonly promosService: PromosService,
  ) {}

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

  private mapTripRow(row: any): Trip {
    const pickupGeo = JSON.parse(row.pickupLocationGeoJson);
    const destGeo = JSON.parse(row.destinationLocationGeoJson);

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
      surgeMultiplier: Number(row.surgeMultiplier),
      totalFare: row.totalFare,
      paymentMethod: row.paymentMethod as PaymentMethod | null,
      paymentStatus: row.paymentStatus as PaymentStatus,
      paystackReference: row.paystackReference,
      passengerRating: row.passengerRating,
      driverRating: row.driverRating,
      rideSharePartnerId: row.rideSharePartnerId,
      isShared: row.isShared,
      startedAt: row.startedAt ? row.startedAt.toISOString() : null,
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
      cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
      cancelReason: row.cancelReason,
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
        surge_multiplier AS "surgeMultiplier",
        total_fare AS "totalFare",
        payment_method AS "paymentMethod",
        payment_status AS "paymentStatus",
        paystack_reference AS "paystackReference",
        passenger_rating AS "passengerRating",
        driver_rating AS "driverRating",
        ride_share_partner_id AS "rideSharePartnerId",
        is_shared AS "isShared",
        started_at AS "startedAt",
        completed_at AS "completedAt",
        cancelled_at AS "cancelledAt",
        cancel_reason AS "cancelReason",
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
        surge_multiplier AS "surgeMultiplier",
        total_fare AS "totalFare",
        payment_method AS "paymentMethod",
        payment_status AS "paymentStatus",
        paystack_reference AS "paystackReference",
        passenger_rating AS "passengerRating",
        driver_rating AS "driverRating",
        ride_share_partner_id AS "rideSharePartnerId",
        is_shared AS "isShared",
        started_at AS "startedAt",
        completed_at AS "completedAt",
        cancelled_at AS "cancelledAt",
        cancel_reason AS "cancelReason",
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

  async requestTrip(passengerId: string, dto: RequestTripRequest): Promise<RequestTripResponse> {
    const activeTripRows = await this.prisma.$queryRaw<any[]>`
      SELECT id FROM trips
      WHERE passenger_id = ${passengerId}::uuid
        AND status::text IN ('requested', 'matched', 'en_route', 'active')
      LIMIT 1;
    `;
    if (activeTripRows.length > 0) {
      throw new AppException('TRIP_ALREADY_ACTIVE');
    }

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

    const permittedPickup = await this.zonesService.isPointInPermittedZone(dto.pickup);
    const permittedDest = await this.zonesService.isPointInPermittedZone(dto.destination);
    if (!permittedPickup && !permittedDest) {
      throw new AppException('INVALID_ZONE');
    }

    const distanceKm = this.haversineDistance(dto.pickup, dto.destination);
    const durationMin = Math.max(1, Math.round(distanceKm * 2.5));

    let estimate = await this.pricingService.estimateFare({
      vehicleType: dto.vehicleType,
      distanceKm,
      durationMin,
      pickup: dto.pickup,
      isShared: dto.isShared,
    });

    if (dto.promoCode) {
      const promo = await this.promosService.validateAndRedeem(dto.promoCode);
      const originalTotalFare = estimate.totalFare;
      const discounted = this.promosService.applyDiscount(promo, originalTotalFare);
      estimate = {
        ...estimate,
        totalFare: discounted.totalFare,
        originalTotalFare,
        promoDiscount: discounted.discountAmount,
        promoCode: discounted.promoCode,
      };
    }

    const tripId = crypto.randomUUID();

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
        base_fare,
        distance_fare,
        time_fare,
        surge_multiplier,
        total_fare,
        payment_method,
        payment_status,
        is_shared,
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
        ${estimate.baseFare},
        ${estimate.distanceFare},
        ${estimate.timeFare},
        ${estimate.surgeMultiplier},
        ${estimate.totalFare},
        ${dto.paymentMethod}::"PaymentMethod",
        'pending'::"PaymentStatus",
        ${dto.isShared ?? false},
        NOW()
      );
    `;

    const trip = await this.getTrip(tripId);
    if (!trip) {
      throw new AppException('INTERNAL_ERROR', undefined, 'Failed to create trip');
    }

    this.matchingService.dispatch(tripId).catch((err) => {
      this.logger.error(`Matching dispatch failed for trip ${tripId}: ${err.message}`);
    });

    return {
      trip,
      estimate,
    };
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

    const updateData: any = { status: to };

    if (to === TripStatus.MATCHED) {
      if (!driverId) {
        throw new AppException('VALIDATION_ERROR', undefined, 'Driver ID is required for matching');
      }
      updateData.driverId = driverId;
    } else if (to === TripStatus.ACTIVE) {
      updateData.startedAt = new Date();
    } else if (to === TripStatus.COMPLETED) {
      updateData.completedAt = new Date();
      if (trip.paymentMethod === PaymentMethod.CASH) {
        updateData.paymentStatus = 'released';
      } else {
        updateData.paymentStatus = 'held';
      }
    } else if (to === TripStatus.CANCELLED) {
      updateData.cancelledAt = new Date();
      updateData.cancelReason = `${actor}: cancelled`;
    }

    await this.prisma.trip.update({
      where: { id: tripId },
      data: updateData,
    });

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
    } else if (to === TripStatus.CANCELLED) {
      this.eventsGateway.server
        .to(`trip:${tripId}`)
        .emit(SOCKET_EVENTS.TRIP_CANCELLED, {
          tripId,
          reason: updatedTrip.cancelReason || '',
          cancelledBy: actor,
        });
    }

    return updatedTrip;
  }
}
