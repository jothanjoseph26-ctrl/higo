import { Kobo } from '@higo/shared-types';

export interface PaystackBaseResponse<T> {
  status: boolean;
  message: string;
  data: T;
}

export interface PaystackInitializeData {
  authorization_url: string;
  access_code: string;
  reference: string;
}

export interface PaystackRecipientData {
  recipient_code: string;
  type: string;
  name: string;
  details: {
    authorization_code?: string;
    account_number: string;
    account_name: string;
    bank_code: string;
    bank_name: string;
  };
}

export interface PaystackTransferData {
  reference: string;
  integration: number;
  domain: string;
  amount: Kobo;
  currency: string;
  source: string;
  reason: string;
  recipient: string;
  status: 'success' | 'queued' | 'processing' | 'failed';
  transfer_code: string;
  id: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaystackSubscriptionData {
  subscription_code: string;
  amount: Kobo;
  status: string;
  email: string;
  next_payment_date: string;
  plan: {
    plan_code: string;
    name: string;
  };
}

export interface PaystackRefundData {
  transaction: number;
  integration: number;
  id: number;
  refund_reference: string;
  amount: Kobo;
  status: string;
}
