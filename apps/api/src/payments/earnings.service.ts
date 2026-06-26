import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  GetEarningsResponse,
  GetEarningsSummaryQuery,
  GetEarningsSummaryResponse,
  FinancialReportQuery,
  FinancialReportResponse,
  PaginationQuery,
  PaymentMethod,
  PaymentStatus,
  Kobo,
} from '@higo/shared-types';
import { AppException } from '../common/errors/app.exception';
import { AiService } from '../ai/ai.service';

@Injectable()
export class EarningsService {
  private readonly logger = new Logger(EarningsService.name);
  private readonly commissionRate: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly ai: AiService,
    config: ConfigService,
  ) {
    this.commissionRate = Number(config.get<number>('PLATFORM_COMMISSION_RATE', 0.10));
  }

  /**
   * Fetch paginated list of completed trips and calculate payout details.
   */
  async getEarnings(driverId: string, q: PaginationQuery): Promise<GetEarningsResponse> {
    const limit = Math.min(q.limit || 20, 20);
    const cursor = q.cursor;

    // Fetch Completed or Released trips
    const trips = await this.prisma.trip.findMany({
      where: {
        driverId,
        status: 'completed',
        paymentStatus: {
          in: ['held', 'released'],
        },
      },
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { createdAt: 'desc' },
    });

    const hasNextPage = trips.length > limit;
    const itemsToReturn = hasNextPage ? trips.slice(0, limit) : trips;
    const nextCursor = hasNextPage ? itemsToReturn[itemsToReturn.length - 1].id : null;

    const items = itemsToReturn.map((trip) => {
      const grossFare = trip.totalFare;
      const platformFee = Math.round(grossFare * this.commissionRate);
      const driverPayout = Math.round(grossFare * (1 - this.commissionRate));

      return {
        tripId: trip.id,
        date: trip.createdAt.toISOString(),
        grossFare,
        platformFee,
        driverPayout,
        paymentMethod: (trip.paymentMethod as PaymentMethod) || PaymentMethod.CARD,
        paymentStatus: trip.paymentStatus as PaymentStatus,
      };
    });

    return {
      items,
      pageInfo: {
        nextCursor,
        hasNextPage,
        count: items.length,
      },
    };
  }

  /**
   * Aggregate earnings and generate Pidgin summary.
   */
  async getSummary(driverId: string, q: GetEarningsSummaryQuery): Promise<GetEarningsSummaryResponse> {
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) {
      throw new AppException('NOT_FOUND', undefined, 'Driver not found');
    }

    const { from, to, periodKey } = this.resolveSummaryRange(q.date);

    // Cache key for the Pidgin summary
    const cacheKey = `earnings:summary:${driverId}:${periodKey}`;
    let cachedSummary = await this.redis.get(cacheKey);

    // Query trips
    const trips = await this.prisma.trip.findMany({
      where: {
        driverId,
        status: 'completed',
        paymentStatus: {
          in: ['held', 'released'],
        },
        createdAt: {
          gte: from,
          lte: to,
        },
      },
    });

    let grossEarnings = 0;
    let platformFee = 0;
    let netPayout = 0;

    const dailyMap = new Map<string, { date: string; trips: number; net: number }>();

    for (const trip of trips) {
      const gross = trip.totalFare;
      const fee = Math.round(gross * this.commissionRate);
      const net = Math.round(gross * (1 - this.commissionRate));

      grossEarnings += gross;
      platformFee += fee;
      netPayout += net;

      const dateStr = trip.createdAt.toISOString().split('T')[0];
      const dayData = dailyMap.get(dateStr) || { date: dateStr, trips: 0, net: 0 };
      dayData.trips += 1;
      dayData.net += net;
      dailyMap.set(dateStr, dayData);
    }

    const daily = Array.from(dailyMap.values()).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    if (!cachedSummary) {
      cachedSummary = await this.generatePidginSummary(
        driver.name,
        trips.length,
        grossEarnings - platformFee, // Net earnings in kobo
      );
      // Cache the summary for 1 hour (daily summary can change as day goes)
      await this.redis.set(cacheKey, cachedSummary, 3600);
    }

    return {
      period: periodKey,
      totalTrips: trips.length,
      grossEarnings,
      platformFee,
      netPayout,
      summary: cachedSummary,
      daily,
    };
  }

  /**
   * Helper to resolve start and end dates for summaries.
   */
  private resolveSummaryRange(dateParam?: string): { from: Date; to: Date; periodKey: string } {
    const now = new Date();
    let from = new Date();
    let to = new Date();
    let periodKey = 'today';

    if (!dateParam || dateParam === 'today') {
      from.setUTCHours(0, 0, 0, 0);
      to.setUTCHours(23, 59, 59, 999);
      periodKey = now.toISOString().split('T')[0];
    } else if (dateParam === 'week') {
      from.setDate(now.getDate() - 7);
      periodKey = 'week';
    } else if (dateParam === 'month') {
      from.setMonth(now.getMonth() - 1);
      periodKey = 'month';
    } else {
      // Custom date, e.g. YYYY-MM-DD
      const parsed = new Date(dateParam);
      if (isNaN(parsed.getTime())) {
        throw new AppException('VALIDATION_ERROR', undefined, 'Invalid date format');
      }
      from = new Date(parsed);
      from.setUTCHours(0, 0, 0, 0);
      to = new Date(parsed);
      to.setUTCHours(23, 59, 59, 999);
      periodKey = dateParam;
    }

    return { from, to, periodKey };
  }

  /**
   * Generate highly personalized Pidgin summary using OpenRouter or a deterministic template.
   */
  private async generatePidginSummary(driverName: string, tripCount: number, netPayoutKobo: number): Promise<string> {
    const formattedNaira = `₦${(netPayoutKobo / 100).toLocaleString()}`;
    const defaultMessage = `${driverName}, you do ${tripCount} trip${tripCount === 1 ? '' : 's'} today, you make ${formattedNaira} after HiGo commission. Keep am up!`;

    const prompt = `Write a short, encouraging message in Nigerian Pidgin English for a taxi/keke driver named ${driverName}. 
Today they completed ${tripCount} trips and earned a net payout of ${formattedNaira} (already after our platform commission).
Keep the summary to 1-2 sentences. Be warm, motivating, and friendly (e.g. use standard Pidgin slang like "Keep am up", "No shaking", "More blessings").`;

    const generated = await this.ai.prompt(
      'You are a friendly Abuja keke dispatch assistant.',
      prompt,
      { maxTokens: 100, temperature: 0.7, timeout: 5000 },
    );

    return generated || defaultMessage;
  }

  /**
   * Admin Financial Report aggregations.
   */
  async getFinancialReport(q: FinancialReportQuery): Promise<FinancialReportResponse> {
    const from = q.from ? new Date(q.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // default 30 days
    const to = q.to ? new Date(q.to) : new Date();

    // Query Completed Trips
    const trips = await this.prisma.trip.findMany({
      where: {
        status: 'completed',
        createdAt: { gte: from, lte: to },
      },
      select: {
        totalFare: true,
        paymentStatus: true,
        createdAt: true,
      },
    });

    // Query Subscriptions
    const subscriptions = await this.prisma.subscription.findMany({
      where: {
        isActive: true,
        startedAt: { gte: from, lte: to },
      },
      select: {
        amount: true,
        startedAt: true,
      },
    });

    // Query Refunds (recorded in financial audits)
    const refundsLogs = await this.prisma.financialAudit.findMany({
      where: {
        action: 'refund.processed',
        createdAt: { gte: from, lte: to },
      },
      select: {
        amount: true,
        createdAt: true,
      },
    });

    // Grouping & series calculation
    const groupBy = q.groupBy || 'day';

    const getPeriodKey = (date: Date): string => {
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');

      if (groupBy === 'month') {
        return `${year}-${month}`;
      } else if (groupBy === 'week') {
        // Calculate week number
        const startOfYear = new Date(year, 0, 1);
        const pastDaysOfYear = (date.getTime() - startOfYear.getTime()) / 86400000;
        const weekNum = Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7);
        return `${year}-W${String(weekNum).padStart(2, '0')}`;
      }
      return `${year}-${month}-${day}`;
    };

    const periodMap = new Map<
      string,
      { period: string; gross: Kobo; platformFee: Kobo; driverPayout: Kobo; trips: number }
    >();

    let totalGross: Kobo = 0;
    let totalPlatformFee: Kobo = 0;
    let totalDriverPayout: Kobo = 0;
    let totalTripsCount = 0;

    // Process Trips
    for (const trip of trips) {
      const gross = trip.totalFare;
      const fee = Math.round(gross * this.commissionRate);
      const payout = Math.round(gross * (1 - this.commissionRate));

      totalGross += gross;
      totalPlatformFee += fee;
      totalDriverPayout += payout;
      totalTripsCount += 1;

      const pKey = getPeriodKey(trip.createdAt);
      const periodData = periodMap.get(pKey) || {
        period: pKey,
        gross: 0,
        platformFee: 0,
        driverPayout: 0,
        trips: 0,
      };

      periodData.gross += gross;
      periodData.platformFee += fee;
      periodData.driverPayout += payout;
      periodData.trips += 1;
      periodMap.set(pKey, periodData);
    }

    // Process subscriptions revenue
    let totalSubRevenue: Kobo = 0;
    for (const sub of subscriptions) {
      totalSubRevenue += sub.amount;
    }

    // Process refunds
    let totalRefunds: Kobo = 0;
    for (const ref of refundsLogs) {
      if (ref.amount) {
        totalRefunds += ref.amount;
      }
    }

    // Convert period map to sorted list
    const series = Array.from(periodMap.values()).sort(
      (a, b) => new Date(a.period.replace('-W', '-')).getTime() - new Date(b.period.replace('-W', '-')).getTime(),
    );

    return {
      range: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
      totals: {
        gross: totalGross,
        platformFee: totalPlatformFee,
        driverPayout: totalDriverPayout,
        refunds: totalRefunds,
        subscriptionRevenue: totalSubRevenue,
        trips: totalTripsCount,
      },
      series,
    };
  }
}
