import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';
import { PaymentMethod } from '@higo/shared-types';

const PAYSTACK_API_BASE = 'https://api.paystack.co';
const SAVED_CARDS_KEY = '@higo/passenger/savedCards';
const PAYMENT_CALLBACK_PREFIX = 'higo-passenger://payment-callback';

/** ₦1.00 verification charge (kobo) for card authorization in test/save flows. */
const CARD_SAVE_AMOUNT_KOBO = 100;

interface PaystackInitializeData {
  reference: string;
  authorization_url: string;
  access_code: string;
}

interface PaystackApiResponse<T> {
  status: boolean;
  message: string;
  data: T;
}

export interface SavedCard {
  reference: string;
  last4?: string;
  brand?: string;
  expMonth?: string;
  expYear?: string;
  savedAt: string;
}

export interface CardSaveIntentResult {
  reference: string;
  authorizationUrl: string;
  accessCode: string;
  amount: number;
}

export interface CardSaveIntentOptions {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}

interface InitializePaymentPayload {
  tripId: string;
  paymentMethod: PaymentMethod;
}

export function getPaystackPublicKey(): string {
  return process.env.EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY?.trim() ?? '';
}

export function isPaystackConfigured(): boolean {
  const key = getPaystackPublicKey();
  return key.length > 0 && !key.includes('xxxxx');
}

export function isPaystackTestMode(): boolean {
  return getPaystackPublicKey().startsWith('pk_test_');
}

export function getPaystackCheckoutUrl(accessCode: string): string {
  return `https://checkout.paystack.com/${accessCode}`;
}

export function parsePaystackCallbackUrl(url: string): { reference: string | null; status: string | null } {
  try {
    const normalized = url.includes('://') ? new URL(url) : new URL(url, 'https://hiconnectgo.com');
    const reference =
      normalized.searchParams.get('reference') ??
      normalized.searchParams.get('trxref') ??
      normalized.searchParams.get('ref');
    const status = normalized.searchParams.get('status');
    return { reference, status };
  } catch {
    return { reference: null, status: null };
  }
}

export async function getSavedCards(): Promise<SavedCard[]> {
  const raw = await AsyncStorage.getItem(SAVED_CARDS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as SavedCard[];
  } catch {
    return [];
  }
}

export async function saveLinkedCard(card: SavedCard): Promise<void> {
  const existing = await getSavedCards();
  const deduped = existing.filter((item) => item.reference !== card.reference);
  await AsyncStorage.setItem(SAVED_CARDS_KEY, JSON.stringify([card, ...deduped]));
}

export async function initializeCardSaveIntent(
  options: CardSaveIntentOptions,
): Promise<CardSaveIntentResult> {
  const publicKey = getPaystackPublicKey();
  if (!isPaystackConfigured()) {
    throw new Error(
      'Paystack is not configured. Set EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY to your pk_test_ key.',
    );
  }

  const reference = `HIGO_CARD_${Date.now()}`;
  const response = await fetch(`${PAYSTACK_API_BASE}/transaction/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${publicKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: options.email,
      amount: CARD_SAVE_AMOUNT_KOBO,
      reference,
      currency: 'NGN',
      channels: ['card'],
      callback_url: PAYMENT_CALLBACK_PREFIX,
      metadata: {
        intent: 'card_save',
        custom_fields: [
          { display_name: 'Intent', variable_name: 'intent', value: 'card_save' },
        ],
      },
      ...(options.firstName ? { first_name: options.firstName } : {}),
      ...(options.lastName ? { last_name: options.lastName } : {}),
      ...(options.phone ? { phone: options.phone } : {}),
    }),
  });

  const json = (await response.json()) as PaystackApiResponse<PaystackInitializeData>;
  if (!response.ok || !json.status || !json.data) {
    throw new Error(json.message || 'Failed to initialize Paystack card save');
  }

  return {
    reference: json.data.reference,
    authorizationUrl: json.data.authorization_url,
    accessCode: json.data.access_code,
    amount: CARD_SAVE_AMOUNT_KOBO,
  };
}

export async function openPaystackCheckout(authorizationUrl: string): Promise<void> {
  const canOpen = await Linking.canOpenURL(authorizationUrl);
  if (!canOpen) {
    throw new Error('Cannot open Paystack checkout on this device.');
  }
  await Linking.openURL(authorizationUrl);
}

export async function launchCardSaveIntent(
  options: CardSaveIntentOptions,
): Promise<CardSaveIntentResult> {
  const result = await initializeCardSaveIntent(options);
  await openPaystackCheckout(result.authorizationUrl);
  return result;
}

export async function handlePaystackCallbackUrl(url: string): Promise<SavedCard | null> {
  const { reference, status } = parsePaystackCallbackUrl(url);
  if (!reference) return null;
  if (status && status !== 'success') return null;

  const card: SavedCard = {
    reference,
    brand: isPaystackTestMode() ? 'Test Card' : 'Debit Card',
    last4: isPaystackTestMode() ? '4081' : undefined,
    savedAt: new Date().toISOString(),
  };
  await saveLinkedCard(card);
  return card;
}

export async function initializePayment(payload: InitializePaymentPayload) {
  try {
    const result = await api.initializePayment(payload);
    return result;
  } catch (error) {
    console.error('Failed to initialize Paystack payment', error);
    throw error;
  }
}

export async function openTripPaymentCheckout(
  payload: InitializePaymentPayload,
): Promise<{ reference: string; amount: number }> {
  const payInit = await initializePayment(payload);
  await openPaystackCheckout(payInit.authorizationUrl);
  return { reference: payInit.reference, amount: payInit.amount };
}

/**
 * Polls the trip status to verify if payment is confirmed.
 * Relying on backend webhook is the source of truth, so we check status.
 */
export async function pollPaymentStatus(
  tripId: string,
  onConfirmed: () => void,
  maxAttempts = 10,
  intervalMs = 3000,
) {
  let attempts = 0;

  const check = setInterval(async () => {
    attempts++;
    try {
      const statusInfo = await api.getTripStatus(tripId);
      if (statusInfo.status !== 'requested') {
        clearInterval(check);
        onConfirmed();
      }
    } catch (e) {
      console.warn('Error polling payment status', e);
    }

    if (attempts >= maxAttempts) {
      clearInterval(check);
    }
  }, intervalMs);

  return () => clearInterval(check);
}