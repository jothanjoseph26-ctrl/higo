import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import {
  PaystackBaseResponse,
  PaystackInitializeData,
  PaystackRecipientData,
  PaystackTransferData,
  PaystackSubscriptionData,
  PaystackRefundData,
} from './paystack.types';
import { Kobo } from '@higo/shared-types';

@Injectable()
export class PaystackClient {
  private readonly client: AxiosInstance;
  private readonly logger = new Logger(PaystackClient.name);

  constructor(config: ConfigService) {
    const secretKey = config.getOrThrow<string>('PAYSTACK_SECRET_KEY');
    this.client = axios.create({
      baseURL: 'https://api.paystack.co',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async initializeTransaction(
    email: string,
    amountKobo: Kobo,
    reference: string,
    callbackUrl: string,
  ): Promise<PaystackInitializeData> {
    try {
      const { data } = await this.client.post<PaystackBaseResponse<PaystackInitializeData>>(
        '/transaction/initialize',
        {
          email,
          amount: amountKobo,
          reference,
          callback_url: callbackUrl,
          channels: ['card', 'bank', 'ussd'],
        },
      );
      if (!data.status) {
        throw new Error(data.message);
      }
      return data.data;
    } catch (err: any) {
      this.logger.error(`Paystack initialize transaction failed: ${err.message}`, err.stack);
      throw err;
    }
  }

  async createTransferRecipient(
    name: string,
    accountNumber: string,
    bankCode: string,
  ): Promise<PaystackRecipientData> {
    try {
      const { data } = await this.client.post<PaystackBaseResponse<PaystackRecipientData>>(
        '/transferrecipient',
        {
          type: 'nuban',
          name,
          account_number: accountNumber,
          bank_code: bankCode,
          currency: 'NGN',
        },
      );
      if (!data.status) {
        throw new Error(data.message);
      }
      return data.data;
    } catch (err: any) {
      this.logger.error(`Paystack create transfer recipient failed: ${err.message}`, err.stack);
      throw err;
    }
  }

  async initiateTransfer(
    amountKobo: Kobo,
    recipientCode: string,
    reference: string,
    reason = 'HiGo trip payout',
  ): Promise<PaystackTransferData> {
    try {
      const { data } = await this.client.post<PaystackBaseResponse<PaystackTransferData>>(
        '/transfer',
        {
          source: 'balance',
          amount: amountKobo,
          recipient: recipientCode,
          reason,
          reference,
        },
      );
      if (!data.status) {
        throw new Error(data.message);
      }
      return data.data;
    } catch (err: any) {
      this.logger.error(`Paystack initiate transfer failed: ${err.message}`, err.stack);
      throw err;
    }
  }

  async createSubscription(
    customerEmailOrCode: string,
    planCode: string,
  ): Promise<PaystackSubscriptionData> {
    try {
      const { data } = await this.client.post<PaystackBaseResponse<PaystackSubscriptionData>>(
        '/subscription',
        {
          customer: customerEmailOrCode,
          plan: planCode,
        },
      );
      if (!data.status) {
        throw new Error(data.message);
      }
      return data.data;
    } catch (err: any) {
      this.logger.error(`Paystack create subscription failed: ${err.message}`, err.stack);
      throw err;
    }
  }

  async refundTransaction(
    reference: string,
    amountKobo?: Kobo,
  ): Promise<PaystackRefundData> {
    try {
      const payload: Record<string, any> = { transaction: reference };
      if (amountKobo !== undefined) {
        payload.amount = amountKobo;
      }
      const { data } = await this.client.post<PaystackBaseResponse<PaystackRefundData>>(
        '/refund',
        payload,
      );
      if (!data.status) {
        throw new Error(data.message);
      }
      return data.data;
    } catch (err: any) {
      this.logger.error(`Paystack refund transaction failed: ${err.message}`, err.stack);
      throw err;
    }
  }
}
