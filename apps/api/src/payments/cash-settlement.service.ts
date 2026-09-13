import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from './ledger.service';
import { FinancialAuditService } from './audit/financial-audit.service';
import {
  CashSettlementMethod,
  CashSettlementStatus,
  SettlementStatus,
  Kobo,
  CashCollectionDashboard,
  DriverSettlementSummary,
  CashSettlementRecord,
  PaginationQuery,
  GetDriverSettlementsResponse,
  GetCashAlertsResponse,
  CanAcceptCashTripResponse,
} from '@higo/shared-types';
import { AppException } from '../common/errors/app.exception';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class CashSettlementService {
  private readonly logger = new Logger(CashSettlementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly audit: FinancialAuditService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Check if driver can accept cash trips based on settlement threshold.
   * Called before dispatching a cash trip.
   */
  async canAcceptCashTrip(driverId: string): Promise<CanAcceptCashTripResponse> {
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) {
      return { allowed: false, reason: 'Driver not found' };
    }

    const threshold = driver.settlementThreshold;
    const outstanding = driver.cashCommissionOwed;

    if (outstanding >= threshold) {
      return {
        allowed: false,
        reason: `You have ₦${(outstanding / 100).toLocaleString()} in outstanding HiGO commission. Please settle before accepting more cash trips.`,
        outstandingKobo: outstanding,
        thresholdKobo: threshold,
      };
    }

    return {
      allowed: true,
      outstandingKobo: outstanding,
      thresholdKobo: threshold,
    };
  }

  /**
   * Driver initiates a commission settlement payment.
   */
  async initiateSettlement(
    driverId: string,
    amount: Kobo,
    method: CashSettlementMethod,
  ): Promise<CashSettlementRecord> {
    if (amount <= 0) {
      throw new AppException('VALIDATION_ERROR', undefined, 'Settlement amount must be greater than zero');
    }

    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) {
      throw new AppException('NOT_FOUND', undefined, 'Driver not found');
    }

    if (amount > driver.cashCommissionOwed) {
      throw new AppException(
        'VALIDATION_ERROR',
        undefined,
        `Amount exceeds outstanding balance of ₦${(driver.cashCommissionOwed / 100).toLocaleString()}`,
      );
    }

    const reference = `settle_${driverId.slice(0, 8)}_${Date.now()}`;

    const settlement = await this.prisma.cashSettlement.create({
      data: {
        driverId,
        amount,
        method,
        status: CashSettlementStatus.PENDING,
        reference,
      },
    });

    await this.audit.logEvent({
      action: 'settlement.initiate',
      actorId: driverId,
      actorType: 'driver',
      reference,
      amount,
      beforeStatus: 'outstanding',
      afterStatus: 'pending',
    });

    this.logger.log(`Settlement initiated: driver ${driverId.slice(0, 8)} — ₦${(amount / 100).toLocaleString()} via ${method}`);

    return {
      id: settlement.id,
      amount: settlement.amount,
      method: settlement.method as CashSettlementMethod,
      status: settlement.status as CashSettlementStatus,
      reference: settlement.reference,
      confirmedAt: null,
      createdAt: settlement.createdAt.toISOString(),
    };
  }

  /**
   * Admin confirms a settlement payment has been received.
   */
  async confirmSettlement(
    settlementId: string,
    adminId: string,
  ): Promise<CashSettlementRecord> {
    const settlement = await this.prisma.cashSettlement.findUnique({
      where: { id: settlementId },
    });

    if (!settlement) {
      throw new AppException('NOT_FOUND', undefined, 'Settlement not found');
    }

    if (settlement.status !== CashSettlementStatus.PENDING) {
      throw new AppException(
        'VALIDATION_ERROR',
        undefined,
        `Settlement is already ${settlement.status}`,
      );
    }

    // Update settlement status
    const updated = await this.prisma.cashSettlement.update({
      where: { id: settlementId },
      data: {
        status: CashSettlementStatus.CONFIRMED,
        confirmedBy: adminId,
        confirmedAt: new Date(),
      },
    });

    // Record in ledger — this reduces the driver's commission owed
    await this.ledger.recordSettlement(settlement.driverId, settlement.amount, settlementId);

    await this.audit.logEvent({
      action: 'settlement.confirmed',
      actorId: adminId,
      actorType: 'admin',
      reference: settlement.reference || `settle_${settlementId}`,
      amount: settlement.amount,
      beforeStatus: 'pending',
      afterStatus: 'confirmed',
      metadata: { driverId: settlement.driverId, settlementId },
    });

    this.logger.log(
      `Settlement confirmed: ${settlementId.slice(0, 8)} — ₦${(settlement.amount / 100).toLocaleString()} by driver ${settlement.driverId.slice(0, 8)}`,
    );

    return {
      id: updated.id,
      amount: updated.amount,
      method: updated.method as CashSettlementMethod,
      status: updated.status as CashSettlementStatus,
      reference: updated.reference,
      confirmedAt: updated.confirmedAt?.toISOString() || null,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  /**
   * Admin Cash & Settlements dashboard — overview of all cash collections.
   */
  async getCashCollectionDashboard(dateRange?: { from?: string; to?: string }): Promise<CashCollectionDashboard> {
    const from = dateRange?.from ? new Date(dateRange.from) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const to = dateRange?.to ? new Date(dateRange.to) : new Date();

    // All completed cash trips in the period
    const cashTrips = await this.prisma.trip.findMany({
      where: {
        paymentMethod: 'cash',
        status: 'completed',
        completedAt: { gte: from, lte: to },
      },
      select: {
        id: true,
        totalFare: true,
        driverId: true,
        driver: { select: { name: true } },
        settlementStatus: true,
      },
    });

    let totalCashCollected = 0;
    let totalCommissionOutstanding = 0;
    let totalDriverEarnings = 0;
    const unsettledTripCount = cashTrips.filter((t) => (t as any).settlementStatus !== 'settled').length;

    const driverMap = new Map<string, {
      driverName: string;
      cashCollected: number;
      commissionOwed: number;
      tripsCount: number;
    }>();

    const commissionRate = Number(this.config.get<number>('PLATFORM_COMMISSION_RATE', 0.10));

    for (const trip of cashTrips) {
      const commission = Math.round(trip.totalFare * commissionRate);
      const driverEarnings = Math.round(trip.totalFare * (1 - commissionRate));

      totalCashCollected += trip.totalFare;
      totalDriverEarnings += driverEarnings;

      if ((trip as any).settlementStatus !== 'settled') {
        totalCommissionOutstanding += commission;
      }

      if (trip.driverId) {
        const existing = driverMap.get(trip.driverId) || {
          driverName: trip.driver?.name || 'Unknown',
          cashCollected: 0,
          commissionOwed: 0,
          tripsCount: 0,
        };
        existing.cashCollected += trip.totalFare;
        existing.commissionOwed += commission;
        existing.tripsCount += 1;
        driverMap.set(trip.driverId, existing);
      }
    }

    const drivers: DriverSettlementSummary[] = Array.from(driverMap.entries()).map(([driverId, data]) => ({
      driverId,
      driverName: data.driverName,
      cashCollected: data.cashCollected,
      commissionOwed: data.commissionOwed,
      tripsCount: data.tripsCount,
      status: data.commissionOwed <= 0 ? 'settled' as const : 'outstanding' as const,
    }));

    return {
      totalCashCollected,
      totalCommissionOutstanding,
      totalDriverEarnings,
      unsettledTripCount,
      drivers,
    };
  }

  /**
   * Per-driver settlement management — list all drivers with outstanding balances.
   */
  async getDriverSettlements(
    q: PaginationQuery & { status?: SettlementStatus },
  ): Promise<GetDriverSettlementsResponse> {
    const limit = Math.min(q.limit || 20, 50);
    const cursor = q.cursor;

    // Query drivers with cash commission owed
    const where: any = {
      cashCommissionOwed: { gt: 0 },
    };

    if (q.status === 'settled') {
      where.cashCommissionOwed = 0;
    } else if (q.status === 'outstanding') {
      where.cashCommissionOwed = { gt: 0 };
    }

    const drivers = await this.prisma.driver.findMany({
      where,
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      select: {
        id: true,
        name: true,
        cashCommissionOwed: true,
        settlementThreshold: true,
      },
      orderBy: { cashCommissionOwed: 'desc' },
    });

    const hasNextPage = drivers.length > limit;
    const items = hasNextPage ? drivers.slice(0, limit) : drivers;
    const nextCursor = hasNextPage ? items[items.length - 1].id : null;

    const summaries: DriverSettlementSummary[] = await Promise.all(
      items.map(async (d) => {
        const tripsCount = await this.prisma.trip.count({
          where: {
            driverId: d.id,
            paymentMethod: 'cash',
            status: 'completed',
            settlementStatus: { not: 'settled' },
          },
        });

        return {
          driverId: d.id,
          driverName: d.name,
          cashCollected: 0, // Would need separate query; simplified for now
          commissionOwed: d.cashCommissionOwed,
          tripsCount,
          status: d.cashCommissionOwed > 0 ? 'outstanding' as const : 'settled' as const,
        };
      }),
    );

    return {
      items: summaries,
      pageInfo: {
        nextCursor,
        hasNextPage,
        count: items.length,
      },
    };
  }

  /**
   * Get recent cash trip completions for admin activity feed.
   */
  async getCashAlerts(q: PaginationQuery): Promise<GetCashAlertsResponse> {
    const limit = Math.min(q.limit || 20, 50);
    const cursor = q.cursor;

    const trips = await this.prisma.trip.findMany({
      where: {
        paymentMethod: 'cash',
        status: 'completed',
      },
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { completedAt: 'desc' },
      include: {
        driver: { select: { id: true, name: true } },
      },
    });

    const hasNextPage = trips.length > limit;
    const items = hasNextPage ? trips.slice(0, limit) : trips;
    const nextCursor = hasNextPage ? items[items.length - 1].id : null;

    const commissionRate = Number(this.config.get<number>('PLATFORM_COMMISSION_RATE', 0.10));

    const alerts = items.map((trip) => {
      const commission = Math.round(trip.totalFare * commissionRate);
      return {
        tripId: trip.id,
        driverId: trip.driverId || '',
        driverName: trip.driver?.name || 'Unknown',
        fare: trip.totalFare,
        commission,
        driverEarnings: Math.round(trip.totalFare * (1 - commissionRate)),
        settlementStatus: (trip as any).settlementStatus || 'not_applicable',
        completedAt: trip.completedAt?.toISOString() || trip.createdAt.toISOString(),
      };
    });

    return {
      items: alerts,
      pageInfo: {
        nextCursor,
        hasNextPage,
        count: items.length,
      },
    };
  }

  /**
   * Admin updates a driver's settlement threshold.
   */
  async updateSettlementThreshold(driverId: string, thresholdKobo: Kobo): Promise<void> {
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) {
      throw new AppException('NOT_FOUND', undefined, 'Driver not found');
    }

    await this.prisma.driver.update({
      where: { id: driverId },
      data: { settlementThreshold: thresholdKobo },
    });

    await this.audit.logEvent({
      action: 'settlement.threshold_updated',
      actorType: 'admin',
      reference: `threshold_${driverId}_${Date.now()}`,
      metadata: {
        driverId,
        previousThreshold: driver.settlementThreshold,
        newThreshold: thresholdKobo,
      },
    });

    this.logger.log(
      `Threshold updated for driver ${driverId.slice(0, 8)}: ₦${(thresholdKobo / 100).toLocaleString()}`,
    );
  }
}
