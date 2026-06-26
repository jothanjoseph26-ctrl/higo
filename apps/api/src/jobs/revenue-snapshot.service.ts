import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RevenueSnapshotService {
  private readonly logger = new Logger(RevenueSnapshotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Snapshot a single calendar day. */
  async snapshotDay(date: Date): Promise<void> {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    const commissionRate = this.config.get<number>(
      'PLATFORM_COMMISSION_RATE',
      0.1,
    );

    const [completedTrips, subscriptionsStarted, activeDriverCounts] =
      await Promise.all([
        this.prisma.trip.findMany({
          where: {
            status: 'completed',
            completedAt: { gte: dayStart, lte: dayEnd },
          },
          select: { totalFare: true, driverId: true },
        }),
        this.prisma.subscription.findMany({
          where: { startedAt: { gte: dayStart, lte: dayEnd } },
          select: { amount: true },
        }),
        this.prisma.trip.groupBy({
          by: ['driverId'],
          where: {
            status: 'completed',
            completedAt: {
              gte: new Date(dayStart.getTime() - 6 * 86_400_000),
              lte: dayEnd,
            },
            driverId: { not: null },
          },
          _count: { _all: true },
        }),
      ]);

    const grossGmv = completedTrips.reduce((sum, trip) => sum + trip.totalFare, 0);
    const platformCommission = Math.round(grossGmv * commissionRate);
    const subscriptionRevenue = subscriptionsStarted.reduce(
      (sum, sub) => sum + sub.amount,
      0,
    );
    const refundsIssued = 0;
    const netRevenue = platformCommission + subscriptionRevenue - refundsIssued;
    const activeDrivers = activeDriverCounts.filter(
      (row) => row._count._all >= 3,
    ).length;
    const completedTripsCount = completedTrips.length;
    const avgTripValue =
      completedTripsCount > 0
        ? Math.round(grossGmv / completedTripsCount)
        : 0;

    await this.prisma.$executeRaw`
      INSERT INTO revenue_daily_summary (
        date, gross_gmv, platform_commission, subscription_revenue,
        verification_revenue, cash_fee_collected, cash_fee_outstanding,
        refunds_issued, net_revenue, active_drivers, completed_trips, avg_trip_value
      ) VALUES (
        ${dayStart}, ${grossGmv}, ${platformCommission}, ${subscriptionRevenue},
        0, 0, 0, ${refundsIssued}, ${netRevenue}, ${activeDrivers},
        ${completedTripsCount}, ${avgTripValue}
      )
      ON CONFLICT (date) DO UPDATE SET
        gross_gmv = EXCLUDED.gross_gmv,
        platform_commission = EXCLUDED.platform_commission,
        subscription_revenue = EXCLUDED.subscription_revenue,
        refunds_issued = EXCLUDED.refunds_issued,
        net_revenue = EXCLUDED.net_revenue,
        active_drivers = EXCLUDED.active_drivers,
        completed_trips = EXCLUDED.completed_trips,
        avg_trip_value = EXCLUDED.avg_trip_value
    `;

    this.logger.log(
      `Revenue snapshot saved for ${dayStart.toISOString().slice(0, 10)}: net=${netRevenue} kobo`,
    );
  }
}