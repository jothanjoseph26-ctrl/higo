import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  LedgerEntryType,
  SettlementStatus,
  PaymentMethod,
  Kobo,
  DriverLedgerEntry,
  WalletBalance,
  TripEarningsDetail,
  PaginationQuery,
  GetWalletLedgerResponse,
  GetWalletSettlementHistoryResponse,
  CashSettlementRecord,
} from '@higo/shared-types';
import { AppException } from '../common/errors/app.exception';

@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);
  private readonly commissionRate: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.commissionRate = Number(config.get<number>('PLATFORM_COMMISSION_RATE', 0.10));
  }

  /**
   * Record financial ledger entries when a trip is completed.
   * Called from TripService.transition() on COMPLETED status.
   * Creates immutable entries — never updates or deletes.
   */
  async recordTripCompletion(trip: {
    id: string;
    driverId: string | null;
    totalFare: number;
    paymentMethod: string | null;
  }): Promise<void> {
    if (!trip.driverId) {
      this.logger.warn(`Trip ${trip.id} completed without driver — skipping ledger`);
      return;
    }

    const commission = Math.round(trip.totalFare * this.commissionRate);
    const driverNet = Math.round(trip.totalFare * (1 - this.commissionRate));
    const isCash = trip.paymentMethod === PaymentMethod.CASH;

    // Get current driver balance for the running balance snapshot
    const currentBalance = await this.getDriverCashBalance(trip.driverId);

    if (isCash) {
      // Cash trip: driver collected full fare from passenger, owes commission to platform
      await this.prisma.$transaction([
        // Entry 1: Cash collected by driver (positive — driver received money)
        this.prisma.driverLedger.create({
          data: {
            driverId: trip.driverId,
            tripId: trip.id,
            entryType: LedgerEntryType.CASH_COLLECTED,
            amount: trip.totalFare,
            balanceAfter: currentBalance + trip.totalFare,
            description: `Cash collected — trip ${trip.id.slice(0, 8)}`,
          },
        }),
        // Entry 2: Commission earned by platform (negative — driver owes this)
        this.prisma.driverLedger.create({
          data: {
            driverId: trip.driverId,
            tripId: trip.id,
            entryType: LedgerEntryType.COMMISSION_EARNED,
            amount: -commission,
            balanceAfter: currentBalance + trip.totalFare - commission,
            description: `HiGO commission (10%) — trip ${trip.id.slice(0, 8)}`,
          },
        }),
        // Update trip settlement status
        this.prisma.trip.update({
          where: { id: trip.id },
          data: {
            settlementStatus: SettlementStatus.OUTSTANDING,
            driverCommissionOwed: commission,
          },
        }),
        // Update driver's total commission owed
        this.prisma.driver.update({
          where: { id: trip.driverId },
          data: {
            cashCommissionOwed: { increment: commission },
          },
        }),
      ]);

      this.logger.log(
        `Cash trip ${trip.id.slice(0, 8)} — driver collected ₦${(trip.totalFare / 100).toLocaleString()}, commission ₦${(commission / 100).toLocaleString()} recorded`,
      );
    } else {
      // Card/Bank trip: platform collected fare, owes driver net payout
      await this.prisma.$transaction([
        // Entry 1: Driver payout credited (positive — driver earns this)
        this.prisma.driverLedger.create({
          data: {
            driverId: trip.driverId,
            tripId: trip.id,
            entryType: LedgerEntryType.DRIVER_PAYOUT,
            amount: driverNet,
            balanceAfter: currentBalance + driverNet,
            description: `Earnings — trip ${trip.id.slice(0, 8)}`,
          },
        }),
        // Entry 2: Commission retained by platform (negative — deducted from driver balance)
        this.prisma.driverLedger.create({
          data: {
            driverId: trip.driverId,
            tripId: trip.id,
            entryType: LedgerEntryType.COMMISSION_EARNED,
            amount: -commission,
            balanceAfter: currentBalance + driverNet - commission,
            description: `HiGO commission (10%) — trip ${trip.id.slice(0, 8)}`,
          },
        }),
      ]);

      this.logger.log(
        `Card trip ${trip.id.slice(0, 8)} — driver payout ₦${(driverNet / 100).toLocaleString()} recorded`,
      );
    }
  }

  /**
   * Record a settlement payment from driver to platform.
   */
  async recordSettlement(driverId: string, amount: Kobo, settlementId: string): Promise<void> {
    const currentBalance = await this.getDriverCashBalance(driverId);

    await this.prisma.$transaction([
      // Entry: Commission paid (positive — reduces what driver owes)
      this.prisma.driverLedger.create({
        data: {
          driverId,
          tripId: null,
          entryType: LedgerEntryType.COMMISSION_PAID,
          amount,
          balanceAfter: currentBalance + amount,
          description: `Commission settlement — ${settlementId.slice(0, 8)}`,
          metadata: { settlementId },
        },
      }),
      // Update driver's commission owed
      this.prisma.driver.update({
        where: { id: driverId },
        data: {
          cashCommissionOwed: { decrement: amount },
        },
      }),
    ]);

    this.logger.log(`Settlement recorded: driver ${driverId.slice(0, 8)} paid ₦${(amount / 100).toLocaleString()}`);
  }

  /**
   * Get driver's current cash balance from the ledger.
   * Balance = sum of all ledger entry amounts (positive = driver has money, negative = driver owes).
   */
  async getDriverCashBalance(driverId: string): Promise<Kobo> {
    const result = await this.prisma.driverLedger.aggregate({
      where: { driverId },
      _sum: { amount: true },
    });
    return result._sum.amount || 0;
  }

  /**
   * Get driver's wallet balance breakdown for the "My Money" screen.
   */
  async getWalletBalance(driverId: string): Promise<WalletBalance> {
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) {
      throw new AppException('NOT_FOUND', undefined, 'Driver not found');
    }

    // Cash collected (sum of CASH_COLLECTED entries)
    const cashCollectedResult = await this.prisma.driverLedger.aggregate({
      where: { driverId, entryType: LedgerEntryType.CASH_COLLECTED },
      _sum: { amount: true },
    });

    // Commission owed (sum of COMMISSION_EARNED entries — these are negative)
    const commissionOwedResult = await this.prisma.driverLedger.aggregate({
      where: { driverId, entryType: LedgerEntryType.COMMISSION_EARNED },
      _sum: { amount: true },
    });

    // Commission paid (sum of COMMISSION_PAID entries — these are positive)
    const commissionPaidResult = await this.prisma.driverLedger.aggregate({
      where: { driverId, entryType: LedgerEntryType.COMMISSION_PAID },
      _sum: { amount: true },
    });

    // Available balance from card/bank trips
    const driverPayoutResult = await this.prisma.driverLedger.aggregate({
      where: { driverId, entryType: LedgerEntryType.DRIVER_PAYOUT },
      _sum: { amount: true },
    });

    const cashCollected = cashCollectedResult._sum.amount || 0;
    const commissionOwedRaw = commissionOwedResult._sum.amount || 0; // negative
    const commissionPaid = commissionPaidResult._sum.amount || 0;
    const driverPayout = driverPayoutResult._sum.amount || 0;

    const commissionOwed = Math.abs(commissionOwedRaw);
    const outstanding = Math.max(0, commissionOwed - commissionPaid);
    const availableBalance = driverPayout;

    return {
      availableBalance,
      cashCollected,
      commissionOwed,
      commissionSettled: commissionPaid,
      outstanding,
    };
  }

  /**
   * Get paginated ledger entries for driver's "My Money" screen.
   */
  async getDriverLedger(
    driverId: string,
    q: PaginationQuery & { entryType?: LedgerEntryType },
  ): Promise<GetWalletLedgerResponse> {
    const limit = Math.min(q.limit || 20, 50);
    const cursor = q.cursor;

    const where: any = { driverId };
    if (q.entryType) {
      where.entryType = q.entryType;
    }

    const entries = await this.prisma.driverLedger.findMany({
      where,
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { createdAt: 'desc' },
    });

    const hasNextPage = entries.length > limit;
    const items = hasNextPage ? entries.slice(0, limit) : entries;
    const nextCursor = hasNextPage ? items[items.length - 1].id : null;

    return {
      items: items.map((e) => ({
        id: e.id,
        tripId: e.tripId,
        entryType: e.entryType as LedgerEntryType,
        amount: e.amount,
        balanceAfter: e.balanceAfter,
        description: e.description,
        metadata: e.metadata as Record<string, unknown> | null,
        createdAt: e.createdAt.toISOString(),
      })),
      pageInfo: {
        nextCursor,
        hasNextPage,
        count: items.length,
      },
    };
  }

  /**
   * Get settlement history for driver.
   */
  async getSettlementHistory(
    driverId: string,
    q: PaginationQuery,
  ): Promise<GetWalletSettlementHistoryResponse> {
    const limit = Math.min(q.limit || 20, 50);
    const cursor = q.cursor;

    const settlements = await this.prisma.cashSettlement.findMany({
      where: { driverId },
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { createdAt: 'desc' },
    });

    const hasNextPage = settlements.length > limit;
    const items = hasNextPage ? settlements.slice(0, limit) : settlements;
    const nextCursor = hasNextPage ? items[items.length - 1].id : null;

    return {
      items: items.map((s) => ({
        id: s.id,
        amount: s.amount,
        method: s.method as any,
        status: s.status as any,
        reference: s.reference,
        confirmedAt: s.confirmedAt?.toISOString() || null,
        createdAt: s.createdAt.toISOString(),
      })),
      pageInfo: {
        nextCursor,
        hasNextPage,
        count: items.length,
      },
    };
  }

  /**
   * Get per-trip earnings detail for driver.
   */
  async getTripEarningsDetail(driverId: string, tripId: string): Promise<TripEarningsDetail> {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, driverId },
    });

    if (!trip) {
      throw new AppException('NOT_FOUND', undefined, 'Trip not found');
    }

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
      settlementStatus: (trip as any).settlementStatus || SettlementStatus.NOT_APPLICABLE,
    };
  }
}
