import { Injectable, Inject, forwardRef, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import * as crypto from 'crypto';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { GeoRepository } from './geo.repository';
import { CtsService, CtsContext } from './cts.service';
import { TripService } from '../trips/trips.service';
import { EventsGateway } from '../realtime/events.gateway';
import {
  CompositeTrustScore,
  LatLng,
  RankedCandidate,
  SOCKET_EVENTS,
  TripStatus,
  VehicleType,
} from '@higo/shared-types';

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly geoRepo: GeoRepository,
    private readonly ctsService: CtsService,
    @Inject(forwardRef(() => TripService))
    private readonly tripService: TripService,
    private readonly eventsGateway: EventsGateway,
    @InjectQueue('dispatch')
    private readonly dispatchQueue: Queue,
  ) {}

  async findCandidates(pickup: LatLng, vehicleType: VehicleType): Promise<RankedCandidate[]> {
    const nearest = await this.geoRepo.findNearestOnlineDrivers(pickup, vehicleType, 5000);
    
    const scoredCandidates = await Promise.all(
      nearest.map(async (candidate) => {
        const cts = await this.ctsService.computeCTS(candidate.id, {
          distanceMeters: candidate.distanceMeters,
          pickup,
        });
        return {
          driverId: candidate.id,
          distanceMeters: candidate.distanceMeters,
          cts,
        };
      })
    );

    scoredCandidates.sort((a, b) => {
      if (Math.abs(a.cts.total - b.cts.total) > 0.0001) {
        return b.cts.total - a.cts.total; // CTS desc
      }
      return a.distanceMeters - b.distanceMeters; // distance asc
    });

    return scoredCandidates;
  }

  async computeCTS(driverId: string, ctx: CtsContext): Promise<CompositeTrustScore> {
    return this.ctsService.computeCTS(driverId, ctx);
  }

  async dispatch(tripId: string): Promise<void> {
    const trip = await this.tripService.getTrip(tripId);
    if (!trip) {
      this.logger.error(`Trip not found for dispatch: ${tripId}`);
      return;
    }

    if (trip.status !== 'requested') {
      this.logger.warn(`Trip ${tripId} status is ${trip.status}, not requested. Skipping dispatch.`);
      return;
    }

    const candidates = await this.findCandidates(trip.pickupLocation, trip.vehicleType);

    const offeredDriversKey = `dispatch:offered_drivers:${tripId}`;
    const offeredStrList = await this.redis.raw.smembers(offeredDriversKey);
    const offeredSet = new Set(offeredStrList);

    const nextCandidate = candidates.find((c) => !offeredSet.has(c.driverId));

    if (!nextCandidate) {
      this.logger.warn(`No candidates left for trip: ${tripId}. Cancelling trip.`);
      
      this.eventsGateway.server.to(`passenger:${trip.passengerId}`).emit(SOCKET_EVENTS.TRIP_NO_DRIVERS_AVAILABLE, {
        tripId,
      });

      await this.tripService.transition(tripId, TripStatus.CANCELLED, 'system');
      
      await this.redis.del(`dispatch:${tripId}`);
      await this.redis.del(offeredDriversKey);
      return;
    }

    const offerId = crypto.randomUUID();
    const expiresAt = Date.now() + 15000;

    await this.redis.raw.sadd(offeredDriversKey, nextCandidate.driverId);
    await this.redis.expire(offeredDriversKey, 600);

    const job = await this.dispatchQueue.add(
      'timeout',
      { tripId, driverId: nextCandidate.driverId, offerId },
      { delay: 15000, removeOnComplete: true }
    );

    const offerData = {
      driverId: nextCandidate.driverId,
      offerId,
      jobId: job.id,
      expiresAt,
    };
    await this.redis.set(`dispatch:${tripId}`, JSON.stringify(offerData), 600);

    const passenger = await this.prisma.user.findUnique({
      where: { id: trip.passengerId },
    });

    const payload = {
      tripId,
      pickup: trip.pickupLocation,
      pickupAddress: trip.pickupAddress,
      destination: trip.destinationLocation,
      destinationAddress: trip.destinationAddress,
      fare: trip.totalFare,
      surgeMultiplier: trip.surgeMultiplier,
      distanceKm: trip.distanceKm ? Number(trip.distanceKm) : 0,
      durationMin: trip.durationMin || 0,
      passengerId: trip.passengerId,
      passengerName: passenger?.name || null,
      passengerRating: passenger ? Number(passenger.ratingAvg) : 5.0,
      expiresInSeconds: 15,
    };

    this.logger.log(`Offering trip ${tripId} to driver ${nextCandidate.driverId} (offerId: ${offerId})`);
    
    this.eventsGateway.server.to(`driver:${nextCandidate.driverId}`).emit(
      SOCKET_EVENTS.TRIP_NEW_REQUEST,
      payload
    );
  }

  async acceptOffer(driverId: string, tripId: string): Promise<void> {
    const offerKey = `dispatch:${tripId}`;
    const offerStr = await this.redis.get(offerKey);
    if (!offerStr) {
      throw new Error('Offer expired or not found');
    }

    const offer = JSON.parse(offerStr);
    if (offer.driverId !== driverId) {
      throw new Error('Offer was not made to you or is stale');
    }

    if (offer.jobId) {
      try {
        const job = await this.dispatchQueue.getJob(offer.jobId);
        if (job) {
          await job.remove();
        }
      } catch (e) {
        this.logger.warn(`Failed to remove Bull job ${offer.jobId}: ${e}`);
      }
    }

    await this.redis.del(offerKey);
    await this.redis.del(`dispatch:offered_drivers:${tripId}`);

    await this.tripService.transition(tripId, TripStatus.MATCHED, 'driver', driverId);
  }

  async declineOffer(driverId: string, tripId: string, reason?: string): Promise<void> {
    const offerKey = `dispatch:${tripId}`;
    const offerStr = await this.redis.get(offerKey);
    if (!offerStr) return;

    const offer = JSON.parse(offerStr);
    if (offer.driverId !== driverId) return;

    if (offer.jobId) {
      try {
        const job = await this.dispatchQueue.getJob(offer.jobId);
        if (job) {
          await job.remove();
        }
      } catch (e) {
        this.logger.warn(`Failed to remove Bull job ${offer.jobId}: ${e}`);
      }
    }

    await this.redis.del(offerKey);

    this.logger.log(`Driver ${driverId} declined trip ${tripId} (Reason: ${reason || 'none'})`);

    await this.dispatch(tripId);
  }

  async handleOfferTimeout(tripId: string, driverId: string, offerId: string): Promise<void> {
    const offerKey = `dispatch:${tripId}`;
    const offerStr = await this.redis.get(offerKey);
    if (!offerStr) return;

    const offer = JSON.parse(offerStr);
    if (offer.offerId !== offerId || offer.driverId !== driverId) {
      return;
    }

    await this.redis.del(offerKey);

    this.logger.log(`Offer timeout (15s) for trip ${tripId} and driver ${driverId}`);

    await this.dispatch(tripId);
  }
}
