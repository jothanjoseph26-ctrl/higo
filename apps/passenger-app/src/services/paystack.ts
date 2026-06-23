import { api } from './api';
import { PaymentMethod } from '@higo/shared-types';

interface InitializePaymentPayload {
  tripId: string;
  paymentMethod: PaymentMethod;
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

/**
 * Polls the trip status to verify if payment is confirmed.
 * Relying on backend webhook is the source of truth, so we check status.
 */
export async function pollPaymentStatus(
  tripId: string,
  onConfirmed: () => void,
  maxAttempts = 10,
  intervalMs = 3000
) {
  let attempts = 0;
  
  const check = setInterval(async () => {
    attempts++;
    try {
      const statusInfo = await api.getTripStatus(tripId);
      // If the trip payment is confirmed or status changes beyond matching, we stop
      // Note: backend would transition trip or mark transaction paid.
      // We check if trip has matched or active, meaning payment succeeded (for card-required flows)
      // or if transaction list has it. Let's check status.
      // We can also poll transactions or simple trip status.
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
