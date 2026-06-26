#!/usr/bin/env node
/**
 * Local / staging API smoke checks: health + admin login.
 *
 * Usage:
 *   node scripts/smoke-api.cjs
 *   BASE=https://your-api.up.railway.app node scripts/smoke-api.cjs
 *   ADMIN_EMAIL=admin@hiconnect.com ADMIN_PASSWORD=HiGo@Admin2024 node scripts/smoke-api.cjs
 */
'use strict';

const BASE = (process.env.BASE || process.env.API_URL || 'http://localhost:3000').replace(
  /\/$/,
  '',
);
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@hiconnect.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'HiGo@Admin2024';

async function check(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    return true;
  } catch (err) {
    console.error(`✗ ${name}: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log(`Smoke API @ ${BASE}`);
  console.log(`Admin email: ${ADMIN_EMAIL}`);

  let ok = true;

  ok &= await check('GET /health', async () => {
    const res = await fetch(`${BASE}/health`);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const body = await res.json();
    const status = body.status ?? body.data?.status;
    if (status !== 'ok') {
      throw new Error(`unexpected body: ${JSON.stringify(body)}`);
    }
  });

  ok &= await check('GET /health/ready', async () => {
    const res = await fetch(`${BASE}/health/ready`);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status} — ${text}`);
    }
  });

  ok &= await check('POST /api/auth/admin/login', async () => {
    const res = await fetch(`${BASE}/api/auth/admin/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Platform': 'web',
      },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });

    const envelope = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} — ${JSON.stringify(envelope)}`);
    }

    const data = envelope.data ?? envelope;
    const token = data.response?.accessToken ?? data.accessToken;
    const admin = data.user ?? data.admin;
    if (!token) {
      throw new Error(`missing accessToken — ${JSON.stringify(envelope)}`);
    }
    if (!admin?.email) {
      throw new Error(`missing admin profile — ${JSON.stringify(envelope)}`);
    }
    console.log(`  → logged in as ${admin.email} (${admin.role})`);
  });

  if (!ok) {
    console.error('\nSmoke checks failed.');
    process.exit(1);
  }

  console.log('\nAll smoke checks passed.');
}

main().catch((err) => {
  console.error('Smoke runner error:', err);
  process.exit(1);
});