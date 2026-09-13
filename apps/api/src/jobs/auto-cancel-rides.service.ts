import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../realtime/events.gateway';
import { MatchingService } from '../matching/matching.service';
import { SOCKET_EVENTS } from '@higo/shared-types';

const REQUESTED_TIMEOUT_MINUTES = 5;
const MATCHED_TIMEOUT_MINUTES = 45;

@Injectable()
export class AutoCancelRidesService {
  private readonly logger = new Logger(AutoCancelRidesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => EventsGateway))
    private readonly eventsGateway: EventsGateway,
    @Inject(forwardRef(() => MatchingService))
    private readonly matchingService: MatchingService,
  ) {}

  async cancelStuckTrips(now = new Date()): Promise<{ cancelled: number; timestamp: string }> {
    const requestedCutoff = new Date(now.getTime() - REQUESTED_TIMEOUT_MINUTES * 60 * 1000);
    const matchedCutoff = new Date(now.getTime() - MATCHED_TIMEOUT_MINUTES * 60 * 1000);

    // Query affected trips BEFORE cancelling so we can emit events + clean Redis
    const staleTrips = await this.prisma.trip.findMany({
      where: {
        OR: [
          { status: 'requested', isScheduled: false, createdAt: { lt: requestedCutoff } },
          { status: 'matched', createdAt: { lt: matchedCutoff } },
        ],
      },
      select: { id: true, passengerId: true, driverId: true, status: true },
    });

    // Emit TRIP_CANCELLED + clean up Redis for each stale trip
    for (const trip of staleTrips) {
      try {
        this.eventsGateway.server
          .to(`trip:${trip.id}`)
          .emit(SOCKET_EVENTS.TRIP_CANCELLED, {
            tripId: trip.id,
            reason: trip.status === 'requested'
              ? 'Auto-cancelled: no driver found within 5 minutes'
              : 'Auto-cancelled: driver did not proceed within 45 minutes',
            cancelledBy: 'system',
          });
      } catch (err) {
        this.logger.warn(`Failed to emit TRIP_CANCELLED for trip ${trip.id}: ${err}`);
      }

      try {
        await this.matchingService.releaseOfferKeys(trip.id);
      } catch (err) {
        this.logger.warn(`Failed to release offer keys for trip ${trip.id}: ${err}`);
      }
    }

    const [requested, matched] = await Promise.all([
      this.prisma.trip.updateMany({
        where: {
          status: 'requested',
          isScheduled: false,
          createdAt: { lt: requestedCutoff },
        },
        data: {
          status: 'cancelled',
          cancelledAt: now,
          cancelReason: 'Auto-cancelled: no driver found within 5 minutes',
        },
      }),
      this.prisma.trip.updateMany({
        where: {
          status: 'matched',
          createdAt: { lt: matchedCutoff },
        },
        data: {
          status: 'cancelled',
          cancelledAt: now,
          cancelReason: 'Auto-cancelled: driver did not proceed within 45 minutes',
        },
      }),
    ]);

    return {
      cancelled: requested.count + matched.count,
      timestamp: now.toISOString(),
    };
  }
}
