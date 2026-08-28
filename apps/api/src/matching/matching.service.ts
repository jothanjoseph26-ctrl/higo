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
import { PushService } from '../push/push.service';
import { WebPushService } from '../push/web-push.service';
import { PlatformSettingsReader } from '../admin/platform-settings-reader.service';
import { PresenceService } from '../realtime/presence.service';
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
    private readonly pushService: PushService,
    private readonly webPushService: WebPushService,
    private readonly settings: PlatformSettingsReader,
    private readonly presenceService: PresenceService,
    @InjectQueue('dispatch')
    private readonly dispatchQueue: Queue,
  ) {}

  /**
   * P0: findCandidates now accepts an optional `city` parameter.
   *
   * When city is provided, the geo query filters drivers by matching city.
   * Drivers with NULL city are EXCLUDED (marked LOCATION_UNCLASSIFIED).
   *
   * When city is null/undefined, falls back to proximity-only search
   * (backward compatible with existing callers).
   */
  async findCandidates(pickup: LatLng, vehicleType: VehicleType, city?: string): Promise<RankedCandidate[]> {
    const matchSettings = await this.settings.getMatchSettings();
    const nearest = await this.geoRepo.findNearestOnlineDrivers(pickup, vehicleType, matchSettings.radiusMeters, city);
    
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

  private static readonly MAX_CONCURRENT_OFFERS = 3;

  private offerKey(tripId: string, driverId: string) {
    return `dispatch:${tripId}:${driverId}`;
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

    // P0: Pass trip city to filter drivers by matching city.
    // trip.city is set during trip creation from reverse geocoding the pickup.
    // If trip.city is null, falls back to proximity-only (backward compatible).
    const candidates = await this.findCandidates(trip.pickupLocation, trip.vehicleType, trip.city ?? undefined);
    this.logger.log(`Dispatch trip ${tripId}: found ${candidates.length} candidates (vehicleType=${trip.vehicleType}, city=${trip.city ?? 'none'}, pickup=[${trip.pickupLocation.lat},${trip.pickupLocation.lng}])`);

    const offeredDriversKey = `dispatch:offered_drivers:${tripId}`;
    const offeredStrList = await this.redis.raw.smembers(offeredDriversKey);
    const offeredSet = new Set(offeredStrList);

    const newCandidates = candidates.filter((c) => !offeredSet.has(c.driverId));

    if (newCandidates.length === 0) {
      this.logger.warn(`No candidates left for trip: ${tripId}. Cancelling trip.`);
      
      this.eventsGateway.server.to(`passenger:${trip.passengerId}`).emit(SOCKET_EVENTS.TRIP_NO_DRIVERS_AVAILABLE, {
        tripId,
      });

      await this.tripService.transition(tripId, TripStatus.CANCELLED, 'system');
      
      await this.redis.del(offeredDriversKey);
      return;
    }

    const matchSettings = await this.settings.getMatchSettings();
    const offerTimeoutMs = matchSettings.offerTimeoutSec * 1000;

    const passenger = await this.prisma.user.findUnique({
      where: { id: trip.passengerId },
    });

    // P1: dispatchEligible gate — driver must have live presence + a delivery channel
    const eligibleToOffer: typeof newCandidates = [];
    for (const c of newCandidates) {
      const check = await this.isDispatchEligible(c.driverId);
      this.logger.log(
        `DISPATCH CHECK driverId=${c.driverId} tripId=${tripId} dbOnline=${check.dbOnline} presenceTtl=${check.presenceTtl} socketCount=${check.socketCount} hasFcmToken=${check.hasFcmToken} hasWebPush=${check.hasWebPush} eligible=${check.eligible}`,
      );
      if (check.eligible) {
        eligibleToOffer.push(c);
        if (eligibleToOffer.length >= MatchingService.MAX_CONCURRENT_OFFERS) break;
      } else {
        this.logger.warn(`DISPATCH SKIP ineligible driver ${c.driverId} trip ${tripId} - no live channel`);
      }
    }

    if (eligibleToOffer.length === 0) {
      this.logger.warn(`No dispatch-eligible drivers for trip ${tripId} (candidates ${newCandidates.length} but none eligible). Cancelling.`);
      this.eventsGateway.server.to(`passenger:${trip.passengerId}`).emit(SOCKET_EVENTS.TRIP_NO_DRIVERS_AVAILABLE, { tripId });
      await this.tripService.transition(tripId, TripStatus.CANCELLED, 'system');
      await this.redis.del(offeredDriversKey);
      return;
    }

    const toOffer = eligibleToOffer;

    this.logger.log(`Offering trip ${tripId} to ${toOffer.length} drivers: ${toOffer.map(c => c.driverId).join(', ')}`);

    for (const candidate of toOffer) {
      const offerId = crypto.randomUUID();
      const expiresAt = Date.now() + offerTimeoutMs;

      await this.redis.raw.sadd(offeredDriversKey, candidate.driverId);
      await this.redis.expire(offeredDriversKey, 600);

      const job = await this.dispatchQueue.add(
        'timeout',
        { tripId, driverId: candidate.driverId, offerId },
        { delay: offerTimeoutMs, removeOnComplete: true }
      );

      const offerData = {
        driverId: candidate.driverId,
        offerId,
        jobId: job.id,
        expiresAt,
      };
      await this.redis.set(this.offerKey(tripId, candidate.driverId), JSON.stringify(offerData), 600);

      const haversineKm = this.haversineDistance(trip.pickupLocation, trip.destinationLocation);
      const distanceKm = trip.distanceKm != null ? Number(trip.distanceKm) : Math.round(haversineKm * 10) / 10;
      const durationMin = trip.durationMin ?? Math.max(1, Math.round(distanceKm * 2.5));
      const payload = {
        tripId,
        pickup: trip.pickupLocation,
        pickupAddress: trip.pickupAddress,
        destination: trip.destinationLocation,
        destinationAddress: trip.destinationAddress,
        fare: trip.totalFare,
        surgeMultiplier: trip.surgeMultiplier,
        distanceKm,
        durationMin,
        passengerId: trip.passengerId,
        passengerName: passenger?.name || null,
        passengerPhone: passenger?.phone || null,
        passengerRating: passenger ? Number(passenger.ratingAvg) : 5.0,
        expiresInSeconds: matchSettings.offerTimeoutSec,
      };

      this.eventsGateway.server.to(`driver:${candidate.driverId}`).emit(
        SOCKET_EVENTS.TRIP_NEW_REQUEST,
        payload
      );

      void this.pushService.sendToDriver(candidate.driverId, {
        title: 'New ride request',
        body: `Pickup at ${trip.pickupAddress}`,
        data: {
          type: 'trip:new_request',
          tripId,
        },
      });

      // Web push for browser-based driver app (background notifications)
      void this.webPushService.sendToDriver(candidate.driverId, {
        title: 'New ride request',
        body: `Pickup at ${trip.pickupAddress}`,
        data: {
          type: 'trip:new_request',
          tripId,
        },
      });
    }
  }

  private async cancelOtherOffers(tripId: string, acceptedDriverId: string): Promise<void> {
    const offeredDriversKey = `dispatch:offered_drivers:${tripId}`;
    const offeredStrList = await this.redis.raw.smembers(offeredDriversKey);

    for (const driverId of offeredStrList) {
      if (driverId === acceptedDriverId) continue;

      const key = this.offerKey(tripId, driverId);
      const offerStr = await this.redis.get(key);
      if (!offerStr) continue;

      const offer = JSON.parse(offerStr);
      if (offer.jobId) {
        try {
          const job = await this.dispatchQueue.getJob(offer.jobId);
          if (job) await job.remove();
        } catch (e) {
          this.logger.warn(`Failed to remove Bull job ${offer.jobId}: ${e}`);
        }
      }

      await this.redis.del(key);
    }

    await this.redis.del(offeredDriversKey);
  }

  async acceptOffer(driverId: string, tripId: string): Promise<void> {
    const key = this.offerKey(tripId, driverId);
    const offerStr = await this.redis.get(key);

    if (!offerStr) {
      const trip = await this.tripService.getTrip(tripId);
      if (trip?.status === 'matched') {
        this.logger.warn(`Trip ${tripId} already matched — ignoring duplicate accept from ${driverId}`);
        return;
      }
      if (trip?.status === 'requested') {
        this.logger.warn(
          `Late accept for trip ${tripId} by driver ${driverId} — offer window expired but trip still unassigned; honouring it`,
        );
        await this.redis.del(`dispatch:offered_drivers:${tripId}`);
        await this.tripService.transition(tripId, TripStatus.MATCHED, 'driver', driverId);
        return;
      }
      throw new Error('Offer expired or not found');
    }

    const offer = JSON.parse(offerStr);
    if (offer.driverId !== driverId) {
      throw new Error('Offer was not made to you or is stale');
    }

    if (offer.jobId) {
      try {
        const job = await this.dispatchQueue.getJob(offer.jobId);
        if (job) await job.remove();
      } catch (e) {
        this.logger.warn(`Failed to remove Bull job ${offer.jobId}: ${e}`);
      }
    }

    await this.cancelOtherOffers(tripId, driverId);

    await this.tripService.transition(tripId, TripStatus.MATCHED, 'driver', driverId);
  }

  async declineOffer(driverId: string, tripId: string, reason?: string): Promise<void> {
    const key = this.offerKey(tripId, driverId);
    const offerStr = await this.redis.get(key);
    if (!offerStr) return;

    const offer = JSON.parse(offerStr);
    if (offer.driverId !== driverId) return;

    if (offer.jobId) {
      try {
        const job = await this.dispatchQueue.getJob(offer.jobId);
        if (job) await job.remove();
      } catch (e) {
        this.logger.warn(`Failed to remove Bull job ${offer.jobId}: ${e}`);
      }
    }

    await this.redis.del(key);

    this.logger.log(`Driver ${driverId} declined trip ${tripId} (Reason: ${reason || 'none'})`);

    await this.dispatchIfNoActiveOffers(tripId, driverId);
  }

  async handleOfferTimeout(tripId: string, driverId: string, offerId: string): Promise<void> {
    const key = this.offerKey(tripId, driverId);
    const offerStr = await this.redis.get(key);
    if (!offerStr) return;

    const offer = JSON.parse(offerStr);
    if (offer.offerId !== offerId || offer.driverId !== driverId) {
      return;
    }

    const trip = await this.tripService.getTrip(tripId);
    if (!trip || trip.status !== 'requested') {
      this.logger.warn(`Trip ${tripId} is no longer requested (${trip?.status}). Skipping timeout re-dispatch.`);
      await this.redis.del(key);
      return;
    }

    await this.redis.del(key);

    const matchSettings = await this.settings.getMatchSettings();
    this.logger.log(`Offer timeout (${matchSettings.offerTimeoutSec}s) for trip ${tripId} and driver ${driverId}`);

    this.eventsGateway.server.to(`driver:${driverId}`).emit(SOCKET_EVENTS.DRIVER_TRIP_ACCEPT_FAILED, {
      tripId,
      reason: 'timeout',
    });

    await this.dispatchIfNoActiveOffers(tripId, driverId);
  }

  private async dispatchIfNoActiveOffers(tripId: string, excludeDriverId: string): Promise<void> {
    const offeredDriversKey = `dispatch:offered_drivers:${tripId}`;
    const remaining = await this.redis.raw.smembers(offeredDriversKey);
    for (const id of remaining) {
      if (id === excludeDriverId) continue;
      const s = await this.redis.get(this.offerKey(tripId, id));
      if (s) return; // Another offer is still active
    }
    await this.dispatch(tripId);
  }

  private async isDispatchEligible(driverId: string): Promise<{
    eligible: boolean;
    dbOnline: boolean;
    presenceTtl: number;
    socketCount: number;
    hasFcmToken: boolean;
    hasWebPush: boolean;
  }> {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      select: { isOnline: true, fcmToken: true },
    });
    const dbOnline = !!driver?.isOnline;
    const presenceTtl = await this.presenceService.getPresenceTtl(driverId);
    const socketCount = this.eventsGateway.getDriverSocketCount(driverId);
    const hasFcmToken = !!driver?.fcmToken;
    const raw = await this.redis.get(`push:driver:${driverId}`);
    const hasWebPush = !!raw;
    const eligible = dbOnline && presenceTtl > 0 && (socketCount > 0 || hasFcmToken || hasWebPush);
    return { eligible, dbOnline, presenceTtl, socketCount, hasFcmToken, hasWebPush };
  }

  private haversineDistance(p1: LatLng, p2: LatLng): number {
    const R = 6371;
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
}
