/**
 * P0 BACKFILL SCRIPT: Create ledger entries for existing completed cash trips.
 *
 * Run AFTER the Prisma migration is applied:
 *   npx ts-node apps/api/src/scripts/backfill-cash-ledger.ts
 *
 * This script:
 * 1. Finds all completed cash trips that don't have ledger entries
 * 2. Creates CASH_COLLECTED + COMMISSION_EARNED entries for each
 * 3. Updates trip settlementStatus and driver cashCommissionOwed
 *
 * Idempotent — safe to run multiple times.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const COMMISSION_RATE = 0.10; // 10% — matches PLATFORM_COMMISSION_RATE default

interface BackfillResult {
  tripsProcessed: number;
  ledgerEntriesCreated: number;
  driversUpdated: Set<string>;
  errors: string[];
}

async function backfillCashLedger(): Promise<BackfillResult> {
  const result: BackfillResult = {
    tripsProcessed: 0,
    ledgerEntriesCreated: 0,
    driversUpdated: new Set(),
    errors: [],
  };

  console.log('🔄 Starting cash ledger backfill...\n');

  // 1. Find all completed cash trips without ledger entries
  const cashTrips = await prisma.trip.findMany({
    where: {
      paymentMethod: 'cash' as any,
      status: 'completed',
      driverId: { not: null },
    },
    include: {
      ledgerEntries: true,
    },
  });

  console.log(`Found ${cashTrips.length} completed cash trips total`);

  // Filter to trips that don't have ledger entries yet
  const tripsNeedingBackfill = cashTrips.filter((trip) => trip.ledgerEntries.length === 0);
  console.log(`Of those, ${tripsNeedingBackfill.length} need ledger entries\n`);

  if (tripsNeedingBackfill.length === 0) {
    console.log('✅ All cash trips already have ledger entries. Nothing to do.');
    return result;
  }

  // Group by driver for batch processing
  const driverTrips = new Map<string, typeof tripsNeedingBackfill>();
  for (const trip of tripsNeedingBackfill) {
    const driverId = trip.driverId!;
    if (!driverTrips.has(driverId)) {
      driverTrips.set(driverId, []);
    }
    driverTrips.get(driverId)!.push(trip);
  }

  console.log(`Processing ${driverTrips.size} drivers...\n`);

  for (const [driverId, trips] of driverTrips) {
    try {
      console.log(`Driver ${driverId.slice(0, 8)}: ${trips.length} trips to backfill`);

      // Get current balance for this driver
      const existingEntries = await prisma.driverLedger.aggregate({
        where: { driverId },
        _sum: { amount: true },
      });
      let runningBalance = existingEntries._sum.amount || 0;

      // Calculate total commission owed for this driver
      let totalCommissionOwed = 0;

      // Create ledger entries for each trip (oldest first)
      const sortedTrips = trips.sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      );

      const entriesToCreate: Array<{
        driverId: string;
        tripId: string;
        entryType: string;
        amount: number;
        balanceAfter: number;
        description: string;
        createdAt: Date;
      }> = [];

      for (const trip of sortedTrips) {
        const commission = Math.round(trip.totalFare * COMMISSION_RATE);

        // Entry 1: Cash collected (positive)
        runningBalance += trip.totalFare;
        entriesToCreate.push({
          driverId,
          tripId: trip.id,
          entryType: 'cash_collected' as any,
          amount: trip.totalFare,
          balanceAfter: runningBalance,
          description: `Cash collected — trip ${trip.id.slice(0, 8)} (backfill)`,
          createdAt: trip.completedAt || trip.createdAt,
        });

        // Entry 2: Commission earned (negative)
        runningBalance -= commission;
        entriesToCreate.push({
          driverId,
          tripId: trip.id,
          entryType: 'commission_earned' as any,
          amount: -commission,
          balanceAfter: runningBalance,
          description: `HiGO commission (10%) — trip ${trip.id.slice(0, 8)} (backfill)`,
          createdAt: trip.completedAt || trip.createdAt,
        });

        totalCommissionOwed += commission;
        result.ledgerEntriesCreated += 2;
      }

      // Batch create all entries for this driver
      await prisma.driverLedger.createMany({ data: entriesToCreate });

      // Update trip settlement statuses
      for (const trip of sortedTrips) {
        const commission = Math.round(trip.totalFare * COMMISSION_RATE);
        await prisma.trip.update({
          where: { id: trip.id },
          data: {
            settlementStatus: 'outstanding',
            driverCommissionOwed: commission,
          },
        });
      }

      // Update driver's total commission owed
      await prisma.driver.update({
        where: { id: driverId },
        data: {
          cashCommissionOwed: { increment: totalCommissionOwed },
        },
      });

      result.driversUpdated.add(driverId);
      result.tripsProcessed += trips.length;

      console.log(
        `  ✅ ${trips.length} trips, ₦${(totalCommissionOwed / 100).toLocaleString()} commission recorded`,
      );
    } catch (err: any) {
      const msg = `Error processing driver ${driverId}: ${err.message}`;
      console.error(`  ❌ ${msg}`);
      result.errors.push(msg);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('BACKFILL COMPLETE');
  console.log('='.repeat(60));
  console.log(`Trips processed:     ${result.tripsProcessed}`);
  console.log(`Ledger entries created: ${result.ledgerEntriesCreated}`);
  console.log(`Drivers updated:     ${result.driversUpdated.size}`);
  console.log(`Errors:              ${result.errors.length}`);

  if (result.errors.length > 0) {
    console.log('\nErrors:');
    result.errors.forEach((e) => console.log(`  - ${e}`));
  }

  return result;
}

async function main() {
  try {
    await backfillCashLedger();
  } catch (err: any) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
