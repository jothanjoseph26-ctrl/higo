/**
 * Historical backfill: convert legacy driver_ledger entries to
 * financial_events + balance_movements.
 *
 * Run via: railway run node prisma/backfill-financial-events.js
 *
 * Idempotent: uses same idempotency keys as live dual-write.
 * Does NOT update cached projections (migration already seeded them).
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const BATCH_SIZE = 50;

const FinancialEventType = {
  TRIP_COMPLETED: 'TRIP_COMPLETED',
  COMMISSION_SETTLED: 'COMMISSION_SETTLED',
  SUBSCRIPTION_CHARGED: 'SUBSCRIPTION_CHARGED',
  REFUND_ISSUED: 'REFUND_ISSUED',
};

const BalanceType = {
  EARNINGS: 'EARNINGS',
  LIABILITY: 'LIABILITY',
  SETTLEMENT: 'SETTLEMENT',
  METRIC: 'METRIC',
};

const LedgerEntryType = {
  TRIP_EARNING: 'TRIP_EARNING',
  PLATFORM_COMMISSION: 'PLATFORM_COMMISSION',
  COMMISSION_PAYMENT: 'COMMISSION_PAYMENT',
  SUBSCRIPTION_CHARGE: 'SUBSCRIPTION_CHARGE',
  CASH_COLLECTION: 'CASH_COLLECTION',
  REFUND: 'REFUND',
};

function buildIdempotencyKey(groupKey, entries) {
  if (groupKey.startsWith('trip:')) {
    const tripId = entries[0].tripId;
    return `trip:${tripId}:completed`;
  }

  if (groupKey.startsWith('settlement:')) {
    const settlementEntry = entries.find(
      (e) => e.entryType === 'commission_paid'
    );
    if (settlementEntry && settlementEntry.metadata && settlementEntry.metadata.settlementId) {
      return `settlement:${settlementEntry.metadata.settlementId}`;
    }
    return `backfill:${groupKey}`;
  }

  return `backfill:${groupKey}`;
}

function buildDeltasFromLegacy(entries) {
  const deltas = [];

  for (const entry of entries) {
    const isCardTrip = entry.trip && entry.trip.paymentMethod !== 'cash';

    switch (entry.entryType) {
      case 'fare_collection':
        deltas.push({
          balanceType: BalanceType.EARNINGS,
          movementType: LedgerEntryType.TRIP_EARNING,
          amount: entry.amount,
        });
        break;

      case 'cash_collected':
        deltas.push({
          balanceType: BalanceType.METRIC,
          movementType: LedgerEntryType.CASH_COLLECTION,
          amount: entry.amount,
        });
        break;

      case 'commission_earned':
        if (isCardTrip) {
          // Card-trip commission: retained at source, NOT driver liability
        } else {
          deltas.push({
            balanceType: BalanceType.LIABILITY,
            movementType: LedgerEntryType.PLATFORM_COMMISSION,
            amount: -entry.amount,
          });
        }
        break;

      case 'commission_paid':
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

      case 'driver_payout':
        deltas.push({
          balanceType: BalanceType.EARNINGS,
          movementType: LedgerEntryType.TRIP_EARNING,
          amount: entry.amount,
        });
        break;

      case 'refund':
        deltas.push({
          balanceType: BalanceType.EARNINGS,
          movementType: LedgerEntryType.REFUND,
          amount: entry.amount,
        });
        break;

      case 'subscription_fee':
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

function determineEventType(entries) {
  const types = entries.map((e) => e.entryType);

  if (types.includes('fare_collection') || types.includes('driver_payout')) {
    return FinancialEventType.TRIP_COMPLETED;
  }
  if (types.includes('commission_paid')) {
    return FinancialEventType.COMMISSION_SETTLED;
  }
  if (types.includes('subscription_fee')) {
    return FinancialEventType.SUBSCRIPTION_CHARGED;
  }
  if (types.includes('refund')) {
    return FinancialEventType.REFUND_ISSUED;
  }

  return FinancialEventType.TRIP_COMPLETED;
}

function groupLegacyEntries(entries) {
  const grouped = new Map();

  for (const entry of entries) {
    let groupKey;

    if (entry.tripId) {
      groupKey = `trip:${entry.tripId}`;
    } else if (entry.entryType === 'commission_paid') {
      const month = entry.createdAt.toISOString().slice(0, 7);
      groupKey = `settlement:${month}`;
    } else if (entry.entryType === 'subscription_fee') {
      const month = entry.createdAt.toISOString().slice(0, 7);
      groupKey = `subscription:${month}`;
    } else {
      groupKey = `other:${entry.id}`;
    }

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, []);
    }
    grouped.get(groupKey).push(entry);
  }

  return grouped;
}

async function backfillDriver(driverId) {
  const result = {
    driverId,
    eventsCreated: 0,
    movementsCreated: 0,
    skipped: 0,
  };

  const legacyEntries = await prisma.driverLedger.findMany({
    where: { driverId },
    include: { trip: { select: { id: true, paymentMethod: true } } },
    orderBy: { createdAt: 'asc' },
  });

  const grouped = groupLegacyEntries(legacyEntries);

  for (const [groupKey, entries] of grouped) {
    const idempotencyKey = buildIdempotencyKey(groupKey, entries);

    const existingEvent = await prisma.financialEvent.findUnique({
      where: { idempotencyKey },
    });

    if (existingEvent) {
      result.skipped += entries.length;
      continue;
    }

    const deltas = buildDeltasFromLegacy(entries);

    if (deltas.length === 0) {
      result.skipped += entries.length;
      continue;
    }

    const eventType = determineEventType(entries);

    try {
      await prisma.$transaction(async (tx) => {
        const event = await tx.financialEvent.create({
          data: {
            driverId,
            eventType,
            tripId: entries[0].tripId || null,
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
            })
          )
        );
      });

      result.eventsCreated++;
      result.movementsCreated += deltas.length;
    } catch (error) {
      if (error.code === 'P2002') {
        result.skipped += entries.length;
      } else {
        console.error(`Error backfilling driver ${driverId}:`, error.message);
        result.skipped += entries.length;
      }
    }
  }

  return result;
}

async function main() {
  console.log('Starting historical financial event backfill...');
  console.log(`Time: ${new Date().toISOString()}`);

  const drivers = await prisma.driver.findMany({
    select: { id: true },
  });

  console.log(`Found ${drivers.length} drivers to process`);

  let totalEvents = 0;
  let totalMovements = 0;
  let totalSkipped = 0;
  let processed = 0;

  for (let i = 0; i < drivers.length; i += BATCH_SIZE) {
    const batch = drivers.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((d) => backfillDriver(d.id))
    );

    for (const r of results) {
      totalEvents += r.eventsCreated;
      totalMovements += r.movementsCreated;
      totalSkipped += r.skipped;
      processed++;
    }

    console.log(
      `Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} drivers, ` +
      `${totalEvents} events, ${totalMovements} movements, ${totalSkipped} skipped`
    );
  }

  console.log('\n=== Backfill Complete ===');
  console.log(`  Drivers processed: ${processed}`);
  console.log(`  Events created: ${totalEvents}`);
  console.log(`  Movements created: ${totalMovements}`);
  console.log(`  Entries skipped: ${totalSkipped}`);
  console.log(`  Time: ${new Date().toISOString()}`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('Backfill failed:', error);
  process.exit(1);
});
