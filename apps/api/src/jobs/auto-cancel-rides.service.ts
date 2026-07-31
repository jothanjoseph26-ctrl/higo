import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const REQUESTED_TIMEOUT_MINUTES = 5;
const MATCHED_TIMEOUT_MINUTES = 10;

@Injectable()
export class AutoCancelRidesService {
  constructor(private readonly prisma: PrismaService) {}

  async cancelStuckTrips(now = new Date()): Promise<{ cancelled: number; timestamp: string }> {
    const requestedCutoff = new Date(now.getTime() - REQUESTED_TIMEOUT_MINUTES * 60 * 1000);
    const matchedCutoff = new Date(now.getTime() - MATCHED_TIMEOUT_MINUTES * 60 * 1000);

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
          cancelReason: 'Auto-cancelled: driver did not proceed within 10 minutes',
        },
      }),
    ]);

    return {
      cancelled: requested.count + matched.count,
      timestamp: now.toISOString(),
    };
  }
}
