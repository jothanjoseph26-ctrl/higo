import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PaymentService } from '../payment.service';
import { WebhookAck } from '@higo/shared-types';

@Injectable()
export class WebhookHandler {
  private readonly logger = new Logger(WebhookHandler.name);

  constructor(private readonly paymentService: PaymentService) {}

  /**
   * Main entry point for Paystack webhooks.
   * Expects a raw buffer body and x-paystack-signature header.
   */
  async handlePaystackWebhook(rawBody: Buffer, signature: string): Promise<WebhookAck> {
    if (!rawBody || rawBody.length === 0) {
      this.logger.warn('Webhook received with empty raw body');
      throw new BadRequestException('Empty body');
    }
    return this.paymentService.handleWebhook(rawBody, signature);
  }
}
