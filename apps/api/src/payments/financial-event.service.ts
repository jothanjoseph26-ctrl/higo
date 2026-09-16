import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  FinancialEventType,
  LedgerEntryType,
  BalanceType,
} from '@higo/shared-types';

export interface BalanceMovementInput {
  balanceType: BalanceType;
  movementType: LedgerEntryType;
  amount: number; // kobo, signed relative to balance bucket
}

export interface CreateFinancialEventDto {
  driverId: string;
  eventType: FinancialEventType;
  tripId?: string;
  paymentMethod?: string;
  idempotencyKey?: string;
  description: string;
  metadata?: Record<string, unknown>;
  deltas: BalanceMovementInput[];
}

@Injectable()
export class FinancialEventService {
  private readonly logger = new Logger(FinancialEventService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a financial event with balance movements.
   * Idempotent: pre-checks idempotencyKey, catches P2002, returns existing.
   */
  async createEvent(data: CreateFinancialEventDto): Promise<{
    id: string;
    eventType: FinancialEventType;
    deltas: Array<{
      id: string;
      balanceType: BalanceType;
      movementType: LedgerEntryType;
      amount: number;
    }>;
  }> {
    if (!data.idempotencyKey) {
      return this.createEventWithoutIdempotency(data);
    }

    // 1. Pre-check (optimization)
    const existing = await this.prisma.financialEvent.findUnique({
      where: { idempotencyKey: data.idempotencyKey },
      include: { deltas: true },
    });
    if (existing) {
      this.logger.warn(`Idempotent hit: ${data.idempotencyKey}`);
      return existing;
    }

    // 2. Attempt transaction
    try {
      return await this.prisma.$transaction(async (tx) => {
        const event = await tx.financialEvent.create({
          data: {
            driverId: data.driverId,
            eventType: data.eventType,
            tripId: data.tripId,
            paymentMethod: data.paymentMethod,
            idempotencyKey: data.idempotencyKey,
            description: data.description,
            metadata: data.metadata ?? {},
          },
        });

        const deltas = await Promise.all(
          data.deltas.map((delta) =>
            tx.balanceMovement.create({
              data: {
                eventId: event.id,
                balanceType: delta.balanceType,
                movementType: delta.movementType,
                amount: delta.amount,
              },
            }),
          ),
        );

        await this.updateDriverProjections(tx, data.driverId, data.deltas);

        return { id: event.id, eventType: event.eventType, deltas };
      });
    } catch (error) {
      // 3. Catch P2002 (unique constraint violation on idempotency_key)
      if (
        error.code === 'P2002' &&
        error.meta?.target?.includes('idempotency_key')
      ) {
        this.logger.warn(`P2002 idempotent race: ${data.idempotencyKey}`);

        // 4. Fetch the already-created record
        const alreadyCreated = await this.prisma.financialEvent.findUnique({
          where: { idempotencyKey: data.idempotencyKey },
          include: { deltas: true },
        });

        if (alreadyCreated) {
          return alreadyCreated;
        }

        throw error;
      }

      throw error;
    }
  }

  /**
   * Create event without idempotency key (used for legacy compat).
   */
  private async createEventWithoutIdempotency(
    data: CreateFinancialEventDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const event = await tx.financialEvent.create({
        data: {
          driverId: data.driverId,
          eventType: data.eventType,
          tripId: data.tripId,
          paymentMethod: data.paymentMethod,
          description: data.description,
          metadata: data.metadata ?? {},
        },
      });

      const deltas = await Promise.all(
        data.deltas.map((delta) =>
          tx.balanceMovement.create({
            data: {
              eventId: event.id,
              balanceType: delta.balanceType,
              movementType: delta.movementType,
              amount: delta.amount,
            },
          }),
        ),
      );

      await this.updateDriverProjections(tx, data.driverId, data.deltas);

      return { id: event.id, eventType: event.eventType, deltas };
    });
  }

  /**
   * Update cached balance projections on drivers table.
   * Called within the same transaction as event creation.
   */
  private async updateDriverProjections(
    tx: PrismaService,
    driverId: string,
    deltas: BalanceMovementInput[],
  ): Promise<void> {
    const earningsDelta = deltas
      .filter((d) => d.balanceType === BalanceType.EARNINGS)
      .reduce((sum, d) => sum + d.amount, 0);

    const liabilityDelta = deltas
      .filter((d) => d.balanceType === BalanceType.LIABILITY)
      .reduce((sum, d) => sum + d.amount, 0);

    const settlementDelta = deltas
      .filter((d) => d.balanceType === BalanceType.SETTLEMENT)
      .reduce((sum, d) => sum + d.amount, 0);

    await tx.driver.update({
      where: { id: driverId },
      data: {
        ledgerEarningsBalance: { increment: earningsDelta },
        ledgerLiabilityBalance: { increment: liabilityDelta },
        ledgerSettlementBalance: { increment: settlementDelta },
      },
    });
  }

  /**
   * Get driver's ledger-derived balances.
   */
  async getDriverBalances(driverId: string): Promise<{
    earnings: number;
    liability: number;
    settlement: number;
  }> {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      select: {
        ledgerEarningsBalance: true,
        ledgerLiabilityBalance: true,
        ledgerSettlementBalance: true,
      },
    });

    if (!driver) {
      return { earnings: 0, liability: 0, settlement: 0 };
    }

    return {
      earnings: driver.ledgerEarningsBalance,
      liability: driver.ledgerLiabilityBalance,
      settlement: driver.ledgerSettlementBalance,
    };
  }

  /**
   * Reconcile cached projections against ledger-derived balances.
   * Returns discrepancies for audit.
   */
  async reconcileBalances(driverId: string): Promise<{
    earnings: { cached: number; ledger: number; diff: number };
    liability: { cached: number; ledger: number; diff: number };
    settlement: { cached: number; ledger: number; diff: number };
  }> {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      select: {
        ledgerEarningsBalance: true,
        ledgerLiabilityBalance: true,
        ledgerSettlementBalance: true,
      },
    });

    if (!driver) {
      return {
        earnings: { cached: 0, ledger: 0, diff: 0 },
        liability: { cached: 0, ledger: 0, diff: 0 },
        settlement: { cached: 0, ledger: 0, diff: 0 },
      };
    }

    // Compute balances from balance_movements
    const movements = await this.prisma.balanceMovement.groupBy({
      by: ['balanceType'],
      where: {
        event: { driverId },
      },
      _sum: { amount: true },
    });

    const ledgerBalances = {
      earnings: 0,
      liability: 0,
      settlement: 0,
    };

    for (const m of movements) {
      const sum = m._sum.amount ?? 0;
      switch (m.balanceType) {
        case BalanceType.EARNINGS:
          ledgerBalances.earnings = sum;
          break;
        case BalanceType.LIABILITY:
          ledgerBalances.liability = sum;
          break;
        case BalanceType.SETTLEMENT:
          ledgerBalances.settlement = sum;
          break;
      }
    }

    return {
      earnings: {
        cached: driver.ledgerEarningsBalance,
        ledger: ledgerBalances.earnings,
        diff: Math.abs(driver.ledgerEarningsBalance - ledgerBalances.earnings),
      },
      liability: {
        cached: driver.ledgerLiabilityBalance,
        ledger: ledgerBalances.liability,
        diff: Math.abs(
          driver.ledgerLiabilityBalance - ledgerBalances.liability,
        ),
      },
      settlement: {
        cached: driver.ledgerSettlementBalance,
        ledger: ledgerBalances.settlement,
        diff: Math.abs(
          driver.ledgerSettlementBalance - ledgerBalances.settlement,
        ),
      },
    };
  }
}
