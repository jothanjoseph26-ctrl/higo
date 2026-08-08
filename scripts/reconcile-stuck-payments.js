#!/usr/bin/env node

/**
 * Payment Reconciliation Script
 *
 * Finds and reconciles stuck subscription payments that never reached the webhook.
 * Usage: node reconcile-stuck-payments.js [--dry-run] [--driver-id <id>]
 *
 * Environment variables required:
 *   PAYSTACK_SECRET_KEY  - Paystack secret API key
 *   DATABASE_URL         - PostgreSQL connection string
 *   API_URL              - Backend API URL (default: https://api.hiconnectgo.com)
 */

const https = require('https');

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const API_URL = process.env.API_URL || 'https://api.hiconnectgo.com';
const DRY_RUN = process.argv.includes('--dry-run');
const DRIVER_ID_ARG = process.argv.includes('--driver-id')
  ? process.argv[process.argv.indexOf('--driver-id') + 1]
  : null;

if (!PAYSTACK_SECRET_KEY) {
  console.error('ERROR: PAYSTACK_SECRET_KEY is required');
  process.exit(1);
}

function paystackRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.paystack.co',
      path,
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
    };
    https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse Paystack response: ${data}`));
        }
      });
    }).on('error', reject);
  });
}

const SUB_INIT_REFERENCE_RE = /^sub_init_([0-9a-f-]{36})_\d+$/i;

function extractDriverId(tx) {
  if (tx.metadata && tx.metadata.driver_id) return tx.metadata.driver_id;
  const match = tx.reference && tx.reference.match(SUB_INIT_REFERENCE_RE);
  return match ? match[1] : null;
}

async function findStuckSubscriptions() {
  // Find transactions with sub_init_ prefix that haven't been processed.
  // metadata isn't always attached at charge time, so also fall back to
  // parsing the driver id out of the reference itself.
  const response = await paystackRequest(
    '/transaction?status=success&per_page=100'
  );

  if (!response.status) {
    console.error('Paystack API error:', response.message);
    return [];
  }

  return response.data.filter(
    (tx) =>
      tx.reference &&
      tx.reference.startsWith('sub_init_') &&
      extractDriverId(tx)
  );
}

async function reconcilePayment(tx) {
  const driverId = extractDriverId(tx);
  const plan = (tx.metadata && tx.metadata.plan) || 'daily';
  const amount = tx.amount / 100; // kobo to naira

  console.log(`\n--- Reconciling payment ---`);
  console.log(`  Transaction: ${tx.reference}`);
  console.log(`  Driver: ${driverId}`);
  console.log(`  Plan: ${plan}`);
  console.log(`  Amount: ₦${amount}`);
  console.log(`  Date: ${new Date(tx.created_at).toISOString()}`);

  if (DRY_RUN) {
    console.log('  [DRY RUN] Would activate subscription');
    return { success: true, dryRun: true };
  }

  // Call the backend to activate the subscription
  try {
    const response = await fetch(`${API_URL}/api/payments/subscription/activate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Reconciliation-Script': 'true',
      },
      body: JSON.stringify({
        driverId,
        plan,
        reference: tx.reference,
        amount: tx.amount,
      }),
    });

    const result = await response.json();
    if (response.ok) {
      console.log('  ✅ Subscription activated successfully');
      return { success: true, result };
    } else {
      console.log('  ❌ Activation failed:', result.error || result.message);
      return { success: false, error: result.error };
    }
  } catch (err) {
    console.log('  ❌ Error calling API:', err.message);
    return { success: false, error: err.message };
  }
}

async function main() {
  console.log('=== Payment Reconciliation Script ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`API: ${API_URL}`);
  console.log(`Driver filter: ${DRIVER_ID_ARG || 'all'}`);
  console.log('');

  console.log('Fetching successful transactions from Paystack...');
  const stuckPayments = await findStuckSubscriptions();

  if (stuckPayments.length === 0) {
    console.log('No stuck subscription payments found.');
    return;
  }

  console.log(`Found ${stuckPayments.length} subscription payment(s)`);

  let successCount = 0;
  let failCount = 0;

  for (const tx of stuckPayments) {
    if (DRIVER_ID_ARG && extractDriverId(tx) !== DRIVER_ID_ARG) {
      continue;
    }

    const result = await reconcilePayment(tx);
    if (result.success) successCount++;
    else failCount++;
  }

  console.log(`\n=== Summary ===`);
  console.log(`  Succeeded: ${successCount}`);
  console.log(`  Failed: ${failCount}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
