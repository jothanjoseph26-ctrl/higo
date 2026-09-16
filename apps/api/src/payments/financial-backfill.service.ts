import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  FinancialEventType,
  LedgerEntryType,
  BalanceType,
} from '@higo/shared-types';

interface BackfillResult {
  driverId: string;
  eventsCreated: number;
  movementsCreated: number;
  skipped: number;
}

@Injectable()
export class FinancialBackfillService {
  private readonly logger = new Logger(FinancialBackfillService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotent backfill: convert legacy driver_ledger entries to
   * financial_events + balance_movements.
   *
   * Uses the SAME idempotency keys as live dual-write to prevent duplicates.
   * Does NOT update cached projections (migration already seeds them).
   */
  async backfillDriver(driverId: string): Promise<BackfillResult> {
    const result: BackfillResult = {
      driverId,
      eventsCreated: 0,
      movementsCreated: 0,
      skipped: 0,
    };

    const legacyEntries = await this.prisma.driverLedger.findMany({
      where: { driverId },
      include: { trip: { select: { id: true, paymentMethod: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const grouped = this.groupLegacyEntries(legacyEntries);

    for (const [groupKey, entries] of grouped) {
      // Build the idempotency key — MUST match live dual-write keys
      const idempotencyKey = this.buildIdempotencyKey(groupKey, entries);

      // Check if already created by live dual-write or previous backfill
      const existingEvent = await this.prisma.financialEvent.findUnique({
        where: { idempotencyKey },
      });

      if (existingEvent) {
        result.skipped += entries.length;
        continue;
      }

      const deltas = this.buildDeltasFromLegacy(entries);

      if (deltas.length === 0) {
        result.skipped += entries.length;
        continue;
      }

      const eventType = this.determineEventType(entries);

      // Create event DIRECTLY (not via FinancialEventService) to skip projection update
      // Migration already seeded projections; backfill should not double-count
      await this.prisma.$transaction(async (tx) => {
        const event = await tx.financialEvent.create({
          data: {
            driverId,
            eventType,
            tripId: entries[0].tripId ?? undefined,
            idempotencyKey,
            description: `Historical backfill: ${groupKey}`,
            metadata: {
              backfill: true,
              legacyEntryIds: entries.map((e) => e.id),
            },
          },
        });

        await Promise.all(
          deltas.map((delta) =>
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

        // DO NOT update driver projections — migration already seeded them
      });

      result.eventsCreated++;
      result.movementsCreated += deltas.length;
    }

    this.logger.log(
      `Backfill complete for driver ${driverId}: ${result.eventsCreated} events, ${result.movementsCreated} movements, ${result.skipped} skipped`,
    );

    return result;
  }

  /**
   * Backfill all drivers (batch, idempotent).
   */
  async backfillAll(batchSize = 50): Promise<{
    totalDrivers: number;
    results: BackfillResult[];
  }> {
    const drivers = await this.prisma.driver.findMany({
      select: { id: true },
    });

    const results: BackfillResult[] = [];

    for (let i = 0; i < drivers.length; i += batchSize) {
      const batch = drivers.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((d) => this.backfillDriver(d.id)),
      );
      results.push(...batchResults);

      this.logger.log(
        `Backfill batch ${Math.floor(i / batchSize) + 1} complete: ${batch.length} drivers`,
      );
    }

    return { totalDrivers: drivers.length, results };
  }

  /**
   * Build idempotency key that MATCHES live dual-write keys.
   * This prevents the same trip from being created twice.
   */
  private buildIdempotencyKey(
    groupKey: string,
    entries: Array<{
      entryType: string;
      tripId: string | null;
      metadata: Record<string, unknown> | null;
    }>,
  ): string {
    // Trip completions: use same key as live dual-write
    if (groupKey.startsWith('trip:')) {
      const tripId = entries[0].tripId;
      return `trip:${tripId}:completed`;
    }

    // Settlements: extract settlementId from metadata if available
    if (groupKey.startsWith('settlement:')) {
      const settlementEntry = entries.find(
        (e) => e.entryType === 'LEGACY_COMMISSION_PAID',
      );
      if (settlementEntry?.metadata?.settlementId) {
        // Match live key: settlement:${settlementId}
        return `settlement:${settlementEntry.metadata.settlementId}`;
      }
      // No settlementId in metadata — use backfill-prefixed key (won't collide with live)
      return `backfill:${groupKey}`;
    }

    // Subscriptions and others: use backfill-prefixed key
    return `backfill:${groupKey}`;
  }

  /**
   * Group legacy entries by trip_id or settlement reference.
   */
  private groupLegacyEntries(
    entries: Array<{
      id: string;
      tripId: string | null;
      entryType: string;
      amount: number;
      description: string;
      createdAt: Date;
      metadata: Record<string, unknown> | null;
      trip: { id: string; paymentMethod: string | null } | null;
    }>,
  ): Map<string, typeof entries> {
    const grouped = new Map<string, typeof entries>();

    for (const entry of entries) {
      let groupKey: string;

      if (entry.tripId) {
        groupKey = `trip:${entry.tripId}`;
      } else if (entry.entryType === 'LEGACY_COMMISSION_PAID') {
        const month = entry.createdAt.toISOString().slice(0, 7);
        groupKey = `settlement:${month}`;
      } else if (entry.entryType === 'LEGACY_SUBSCRIPTION_FEE') {
        const month = entry.createdAt.toISOString().slice(0, 7);
        groupKey = `subscription:${month}`;
      } else {
        groupKey = `other:${entry.id}`;
      }

      const existing = grouped.get(groupKey) ?? [];
      existing.push(entry);
      grouped.set(groupKey, existing);
    }

    return grouped;
  }

  /**
   * Build BalanceMovement inputs from legacy entries.
   * Handles sign inversion for liability entries.
   */
  private buildDeltasFromLegacy(
    entries: Array<{
      entryType: string;
      amount: number;
      trip: { paymentMethod: string | null } | null;
    }>,
  ): Array<{
    balanceType: BalanceType;
    movementType: LedgerEntryType;
    amount: number;
  }> {
    const deltas: Array<{
      balanceType: BalanceType;
      movementType: LedgerEntryType;
      amount: number;
    }> = [];

    for (const entry of entries) {
      const isCardTrip = entry.trip?.paymentMethod !== 'cash';

      switch (entry.entryType) {
        case 'LEGACY_FARE_COLLECTION':
          deltas.push({
            balanceType: BalanceType.EARNINGS,
            movementType: LedgerEntryType.TRIP_EARNING,
            amount: entry.amount,
          });
          break;

        case 'LEGACY_CASH_COLLECTED':
          deltas.push({
            balanceType: BalanceType.METRIC,
            movementType: LedgerEntryType.CASH_COLLECTION,
            amount: entry.amount,
          });
          break;

        case 'LEGACY_COMMISSION_EARNED':
          if (isCardTrip) {
            // Card-trip commission: retained at source, NOT driver liability
          } else {
            // Cash-trip commission: legacy -amount → canonical +LIABILITY (invert sign)
            deltas.push({
              balanceType: BalanceType.LIABILITY,
              movementType: LedgerEntryType.PLATFORM_COMMISSION,
              amount: -entry.amount,
            });
          }
          break;

        case 'LEGACY_COMMISSION_PAID':
          deltas.push({
            balanceType: BalanceType.LIABILITY,
            movementType: LedgerEntryType.COMMISSION_PAYMENT,
            amount: -entry.amount,
          });
          deltas.push({
            balanceType: BalanceType.SETTLEMENT,
            movementType: LedgerEntryType.COMMISSION_PAYMENT,
            amount: entry.amount,
          });
          break;

        case 'LEGACY_DRIVER_PAYOUT':
          deltas.push({
            balanceType: BalanceType.EARNINGS,
            movementType: LedgerEntryType.TRIP_EARNING,
            amount: entry.amount,
          });
          break;

        case 'LEGACY_REFUND':
          deltas.push({
            balanceType: BalanceType.EARNINGS,
            movementType: LedgerEntryType.REFUND,
            amount: entry.amount,
          });
          break;

        case 'LEGACY_SUBSCRIPTION_FEE':
          deltas.push({
            balanceType: BalanceType.LIABILITY,
            movementType: LedgerEntryType.SUBSCRIPTION_CHARGE,
            amount: -entry.amount,
          });
          break;
      }
    }

    return deltas;
  }

  /**
   * Determine the FinancialEventType from a group of legacy entries.
   */
  private determineEventType(
    entries: Array<{ entryType: string }>,
  ): FinancialEventType {
    const types = entries.map((e) => e.entryType);

    if (types.includes('LEGACY_FARE_COLLECTION') || types.includes('LEGACY_DRIVER_PAYOUT')) {
      return FinancialEventType.TRIP_COMPLETED;
    }
    if (types.includes('LEGACY_COMMISSION_PAID')) {
      return FinancialEventType.COMMISSION_SETTLED;
    }
    if (types.includes('LEGACY_SUBSCRIPTION_FEE')) {
      return FinancialEventType.SUBSCRIPTION_CHARGED;
    }
    if (types.includes('LEGACY_REFUND')) {
      return FinancialEventType.REFUND_ISSUED;
    }

    return FinancialEventType.TRIP_COMPLETED;
  }
}
