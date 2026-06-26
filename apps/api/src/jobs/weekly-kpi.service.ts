import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WeeklyKpi } from '@higo/shared-types';
import { PrismaService } from '../prisma/prisma.service';

const LAGOS_TZ = 'Africa/Lagos';

@Injectable()
export class WeeklyKpiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Most recent completed week (Mon–Sun) in Africa/Lagos. */
  getCurrentWeekRange(): { from: Date; to: Date } {
    return this.getWeekRangeEnding(this.getLatestSunday(new Date()));
  }

  getWeekRangeEnding(weekEnding: Date): { from: Date; to: Date } {
    const to = new Date(weekEnding);
    to.setHours(23, 59, 59, 999);
    const from = new Date(to);
    from.setDate(from.getDate() - 6);
    from.setHours(0, 0, 0, 0);
    return { from, to };
  }

  async computeForPeriod(from: Date, to: Date): Promise<WeeklyKpi> {
    const [
      totalDrivers,
      tripCountsByDriver,
      tripsRequested,
      tripsCompleted,
      waitTrips,
      newPassengers,
      revenueRows,
    ] = await Promise.all([
      this.prisma.driver.count(),
      this.prisma.trip.groupBy({
        by: ['driverId'],
        where: {
          status: 'completed',
          completedAt: { gte: from, lte: to },
          driverId: { not: null },
        },
        _count: { _all: true },
      }),
      this.prisma.trip.count({
        where: { createdAt: { gte: from, lte: to } },
      }),
      this.prisma.trip.count({
        where: {
          status: 'completed',
          createdAt: { gte: from, lte: to },
        },
      }),
      this.prisma.trip.findMany({
        where: {
          status: 'completed',
          startedAt: { not: null, gte: from, lte: to },
        },
        select: { createdAt: true, startedAt: true },
      }),
      this.prisma.user.count({
        where: { createdAt: { gte: from, lte: to } },
      }),
      this.prisma.$queryRaw<Array<{ net_revenue: number }>>`
        SELECT net_revenue
        FROM revenue_daily_summary
        WHERE date >= ${from} AND date <= ${to}
      `.catch(() => [] as Array<{ net_revenue: number }>),
    ]);

    const activeDrivers = tripCountsByDriver.filter(
      (row: { driverId: string | null; _count: { _all: number } }) =>
        row.driverId && row._count._all >= 3,
    ).length;

    const driverActiveRate =
      totalDrivers > 0 ? activeDrivers / totalDrivers : 0;
    const rideCompletionRate =
      tripsRequested > 0 ? tripsCompleted / tripsRequested : 0;

    const waitMinutes = waitTrips
      .filter((trip: { startedAt: Date | null }) => trip.startedAt)
      .map(
        (trip: { createdAt: Date; startedAt: Date | null }) =>
          (trip.startedAt!.getTime() - trip.createdAt.getTime()) / 60_000,
      );
    const avgPassengerWaitMinutes =
      waitMinutes.length > 0
        ? waitMinutes.reduce((sum: number, value: number) => sum + value, 0) /
          waitMinutes.length
        : 0;

    const marketingSpend = this.config.get<number>(
      'WEEKLY_MARKETING_SPEND_KOBO',
      0,
    );
    const customerAcquisitionCost =
      newPassengers > 0 ? Math.round(marketingSpend / newPassengers) : 0;

    const netRevenue = revenueRows.reduce(
      (sum: number, row: { net_revenue: number }) => sum + row.net_revenue,
      0,
    );
    const operatingCosts = this.config.get<number>(
      'WEEKLY_OPERATING_COSTS_KOBO',
      0,
    );
    const cashBurnVsRevenue =
      netRevenue > 0 ? operatingCosts / netRevenue : 0;

    return {
      driverActiveRate,
      rideCompletionRate,
      avgPassengerWaitMinutes,
      customerAcquisitionCost,
      cashBurnVsRevenue,
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
    };
  }

  async computeHistory(weeks = 12): Promise<
    Array<WeeklyKpi & { weekEnding: string }>
  > {
    const results: Array<WeeklyKpi & { weekEnding: string }> = [];
    let cursor = this.getLatestSunday(new Date());

    for (let i = 0; i < weeks; i++) {
      const { from, to } = this.getWeekRangeEnding(cursor);
      const kpi = await this.computeForPeriod(from, to);
      results.push({
        ...kpi,
        weekEnding: to.toISOString().slice(0, 10),
      });
      cursor = new Date(cursor);
      cursor.setDate(cursor.getDate() - 7);
    }

    return results.reverse();
  }

  formatPlainEnglishSummary(kpi: WeeklyKpi): string {
    const lines = [
      `HiGo Weekly KPI Summary (${kpi.period.from.slice(0, 10)} to ${kpi.period.to.slice(0, 10)})`,
      '',
      `1. Driver Active Rate: ${(kpi.driverActiveRate * 100).toFixed(1)}% (drivers with 3+ trips / total registered)`,
      `2. Ride Completion Rate: ${(kpi.rideCompletionRate * 100).toFixed(1)}%`,
      `3. Avg Passenger Wait: ${kpi.avgPassengerWaitMinutes.toFixed(1)} minutes`,
      `4. Customer Acquisition Cost: ₦${(kpi.customerAcquisitionCost / 100).toLocaleString('en-NG')}`,
      `5. Cash Burn vs Revenue: ${kpi.cashBurnVsRevenue.toFixed(2)}x`,
      '',
      this.suggestActions(kpi),
    ];
    return lines.join('\n');
  }

  private suggestActions(kpi: WeeklyKpi): string {
    const actions: string[] = [];

    if (kpi.driverActiveRate < 0.15) {
      actions.push('Driver activation is low — review onboarding and subscription incentives.');
    }
    if (kpi.rideCompletionRate < 0.7) {
      actions.push('Completion rate is below target — check matching timeouts and driver supply.');
    }
    if (kpi.avgPassengerWaitMinutes > 15) {
      actions.push('Passenger wait time is high — increase online drivers in peak zones.');
    }
    if (kpi.cashBurnVsRevenue > 1) {
      actions.push('Operating costs exceed net revenue — review burn and marketing spend.');
    }

    return actions.length
      ? `Actions required:\n- ${actions.join('\n- ')}`
      : 'No critical actions required this week.';
  }

  private getLatestSunday(reference: Date): Date {
    const lagosDate = new Date(
      reference.toLocaleString('en-US', { timeZone: LAGOS_TZ }),
    );
    const sunday = new Date(lagosDate);
    const day = sunday.getDay();
    sunday.setDate(sunday.getDate() - day);
    sunday.setHours(0, 0, 0, 0);
    return sunday;
  }
}