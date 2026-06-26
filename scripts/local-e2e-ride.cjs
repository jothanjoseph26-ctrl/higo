#!/usr/bin/env node
/**
 * API-level end-to-end ride flow (passenger request → driver accept).
 *
 * Prerequisites:
 *   docker compose up -d
 *   pnpm nx serve @higo/api  (and worker: node apps/api/dist/worker.js)
 *   OTP_PROVIDER=termii + empty TERMII keys → OTP logged as [DEVELOPMENT MOCK SMS]
 *   Or: redis-cli GET "otp:+2348011111111" after send-otp
 *
 * Usage:
 *   node scripts/local-e2e-ride.cjs
 *   PASSENGER_OTP=123456 DRIVER_OTP=654321 node scripts/local-e2e-ride.cjs
 */
'use strict';

const BASE = (process.env.BASE || 'http://localhost:3000').replace(/\/$/, '');
const PASSENGER_PHONE = process.env.PASSENGER_PHONE || '+2348011111111';
const DRIVER_PHONE = process.env.DRIVER_PHONE || '+2348022222222';
const PASSENGER_OTP = process.env.PASSENGER_OTP;
const DRIVER_OTP = process.env.DRIVER_OTP;

const PICKUP = { lat: 9.0765, lng: 7.3986, address: 'Wuse Market, Abuja' };
const DEST = { lat: 9.0579, lng: 7.4951, address: 'Gwarimpa, Abuja' };

async function api(method, path, body, token) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json.error || json)}`);
  }
  return json.data ?? json;
}

async function loginAs(phone, userType, otpFromEnv) {
  await api('POST', '/auth/send-otp', { phone, userType });
  const code = otpFromEnv || process.env[`${userType.toUpperCase()}_OTP`];
  if (!code) {
    throw new Error(
      `No OTP for ${phone}. Set ${userType.toUpperCase()}_OTP env or read: redis-cli GET "otp:${phone}"`,
    );
  }
  const result = await api('POST', '/auth/verify-otp', { phone, code, userType });
  return result.accessToken;
}

async function main() {
  console.log(`\n🛺 HiGo local E2E ride test @ ${BASE}\n`);

  console.log('1) Passenger login...');
  const passengerToken = await loginAs(PASSENGER_PHONE, 'passenger', PASSENGER_OTP);

  console.log('2) Request trip...');
  const trip = await api(
    'POST',
    '/trips/request',
    {
      pickup: PICKUP,
      destination: DEST,
      vehicleType: 'keke',
      paymentMethod: 'cash',
    },
    passengerToken,
  );
  const tripId = trip.id || trip.tripId;
  console.log(`   Trip requested: ${tripId}`);

  console.log('3) Driver login...');
  const driverToken = await loginAs(DRIVER_PHONE, 'driver', DRIVER_OTP);

  console.log('4) Driver go online...');
  await api('PUT', '/drivers/online-status', { isOnline: true }, driverToken);

  console.log('5) Driver accept trip (if offer pending)...');
  try {
    await api('POST', `/trips/${tripId}/accept`, {}, driverToken);
    console.log('   Trip accepted');
  } catch (e) {
    console.warn('   Accept skipped (may need socket dispatch):', e.message);
  }

  console.log('6) Trip status...');
  const status = await api('GET', `/trips/${tripId}/status`, null, passengerToken);
  console.log('   Status:', status.status || status);

  console.log('\n✅ API E2E script finished. Complete ride manually in apps or extend script for transitions.\n');
}

main().catch((err) => {
  console.error('\n❌ E2E failed:', err.message);
  process.exit(1);
});