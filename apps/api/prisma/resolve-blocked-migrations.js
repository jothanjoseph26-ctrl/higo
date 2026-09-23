/**
 * Clear Prisma P3009 blockers before `migrate deploy`.
 * If schema objects already exist, mark the migration applied via
 * `prisma migrate resolve --applied` and normalize the bookkeeping row.
 * Otherwise delete the failed record so migrate deploy can retry
 * (only safe for idempotent migrations).
 */
const { PrismaClient } = require('@prisma/client');
const { execFileSync } = require('child_process');
const path = require('path');

const BLOCKED = [
  {
    name: '20260916000000_add_financial_event_architecture',
    probe: `SELECT to_regclass('financial_events') IS NOT NULL AS ok`,
    idempotent: false,
  },
  {
    name: '20260916120000_add_payout_completed_event_type',
    probe: `SELECT EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'FinancialEventType' AND e.enumlabel = 'PAYOUT_COMPLETED'
    ) AS ok`,
    idempotent: false,
  },
  {
    name: '20260916010000_add_trip_source_and_whatsapp_booking_fields',
    probe: `SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'whatsapp_conversations' AND column_name = 'active_trip_id'
    ) AS ok`,
    idempotent: true,
  },
  {
    name: '20260923120000_add_last_seen_at',
    probe: `SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'last_seen_at'
    ) AS ok`,
    idempotent: false,
  },
];

function resolveApplied(name) {
  try {
    const apiDir = path.resolve(__dirname, '..');
    execFileSync('npx', ['prisma', 'migrate', 'resolve', '--applied', name], {
      cwd: apiDir,
      stdio: 'inherit',
      env: process.env,
    });
    console.log(`[resolve-blocked] marked applied: ${name}`);
    return true;
  } catch (err) {
    // P3008 = already recorded as applied — bookkeeping row may still look blocked
    console.error(`[resolve-blocked] resolve failed for ${name}: ${err.message}`);
    return false;
  }
}

async function normalizeAppliedRow(p, name) {
  const remaining = await p.$queryRawUnsafe(
    `SELECT migration_name FROM _prisma_migrations
     WHERE migration_name = '${name}'
       AND (finished_at IS NULL OR rolled_back_at IS NOT NULL)`,
  );
  if (!remaining.length) return true;

  const good = await p.$queryRawUnsafe(
    `SELECT migration_name FROM _prisma_migrations
     WHERE migration_name = '${name}'
       AND finished_at IS NOT NULL AND rolled_back_at IS NULL`,
  );
  if (good.length) {
    await p.$executeRawUnsafe(
      `DELETE FROM _prisma_migrations
       WHERE migration_name = '${name}'
         AND (finished_at IS NULL OR rolled_back_at IS NOT NULL)`,
    );
    console.log(`[resolve-blocked] removed stale blocked row(s): ${name}`);
    return true;
  }

  await p.$executeRawUnsafe(
    `UPDATE _prisma_migrations
     SET finished_at = COALESCE(finished_at, NOW()),
         rolled_back_at = NULL,
         applied_steps_count = GREATEST(COALESCE(applied_steps_count, 0), 1),
         logs = COALESCE(logs, '')
     WHERE migration_name = '${name}'
       AND (finished_at IS NULL OR rolled_back_at IS NOT NULL)`,
  );
  const after = await p.$queryRawUnsafe(
    `SELECT migration_name FROM _prisma_migrations
     WHERE migration_name = '${name}'
       AND (finished_at IS NULL OR rolled_back_at IS NOT NULL)`,
  );
  if (!after.length) {
    console.log(`[resolve-blocked] normalized applied row: ${name}`);
    return true;
  }
  return false;
}

async function main() {
  const p = new PrismaClient();
  try {
    const failed = await p.$queryRawUnsafe(
      `SELECT migration_name FROM _prisma_migrations
       WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL
       ORDER BY started_at`,
    );
    if (!failed.length) {
      console.log('[resolve-blocked] no blocked migrations');
      return;
    }
    console.log('[resolve-blocked] blocked:', failed.map((r) => r.migration_name).join(', '));
    const blockedNames = new Set(failed.map((r) => r.migration_name));

    for (const known of BLOCKED) {
      if (!blockedNames.has(known.name)) continue;
      const rows = await p.$queryRawUnsafe(known.probe);
      if (rows[0]?.ok) {
        resolveApplied(known.name);
        await normalizeAppliedRow(p, known.name);
      } else if (known.idempotent) {
        await p.$executeRawUnsafe(
          `DELETE FROM _prisma_migrations WHERE migration_name = '${known.name}'`,
        );
        console.log(`[resolve-blocked] deleted failed record (idempotent): ${known.name}`);
      } else {
        console.log(`[resolve-blocked] schema missing for ${known.name} — cannot baseline`);
      }
    }

    const still = await p.$queryRawUnsafe(
      `SELECT migration_name FROM _prisma_migrations
       WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL`,
    );
    if (still.length) {
      console.warn(
        '[resolve-blocked] still blocked after resolve:',
        still.map((r) => r.migration_name).join(', '),
      );
    } else {
      console.log('[resolve-blocked] clear');
    }
  } catch (err) {
    console.error('[resolve-blocked] non-fatal:', err.message);
  } finally {
    await p.$disconnect();
  }
}

main();
