import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PaystackClient } from './paystack/paystack.client';
import { FinancialAuditService } from './audit/financial-audit.service';
import {
  InitializePaymentRequest,
  InitializePaymentResponse,
  WebhookAck,
  PaymentMethod,
  PaymentStatus,
  SubscriptionTier,
  Kobo,
} from '@higo/shared-types';
import { AppException } from '../common/errors/app.exception';
import { createHmac, timingSafeEqual } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly paystackSecret: string;
  private readonly paymentCallbackUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly paystack: PaystackClient,
    private readonly audit: FinancialAuditService,
    private readonly config: ConfigService,
  ) {
    this.paystackSecret = config.getOrThrow<string>('PAYSTACK_SECRET_KEY');
    this.paymentCallbackUrl = config.getOrThrow<string>('APP_PAYMENT_CALLBACK_URL');
  }

  /**
   * Initializes a transaction on Paystack for a passenger's trip.
   */
  async initialize(passengerId: string, dto: InitializePaymentRequest): Promise<InitializePaymentResponse> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: dto.tripId },
      include: { passenger: true },
    });

    if (!trip) {
      throw new AppException('NOT_FOUND', undefined, 'Trip not found');
    }

    if (trip.passengerId !== passengerId) {
      throw new AppException('FORBIDDEN', undefined, 'You cannot initialize payment for this trip');
    }

    const email = trip.passenger.email || `${trip.passenger.phone}@higo.com`;
    const reference = trip.paystackReference || uuidv4();
    const amount = trip.totalFare;

    // Call Paystack Transaction Initialize API
    const transaction = await this.paystack.initializeTransaction(
      email,
      amount,
      reference,
      this.paymentCallbackUrl,
    );

    // Save/update the reference and method on the trip
    await this.prisma.trip.update({
      where: { id: dto.tripId },
      data: {
        paystackReference: reference,
        paymentMethod: dto.paymentMethod,
        paymentStatus: 'pending',
      },
    });

    await this.audit.logEvent({
      action: 'payment.initialize',
      actorId: passengerId,
      actorType: 'passenger',
      reference,
      amount,
      beforeStatus: 'none',
      afterStatus: 'pending',
      metadata: { tripId: dto.tripId, paymentMethod: dto.paymentMethod },
    });

    return {
      reference,
      authorizationUrl: transaction.authorization_url,
      accessCode: transaction.access_code,
      amount,
    };
  }

  /**
   * Logical escrow release: called by Agent 2 (TripService) upon trip completion.
   */
  async releaseEscrow(tripId: string): Promise<void> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip) {
      this.logger.error(`Cannot release escrow: Trip not found id=${tripId}`);
      return;
    }

    if (trip.paymentStatus !== PaymentStatus.HELD) {
      this.logger.warn(`Trip paymentStatus is ${trip.paymentStatus}, not HELD. Skipping escrow release.`);
      return;
    }

    // Move state to released
    await this.prisma.trip.update({
      where: { id: tripId },
      data: { paymentStatus: 'released' },
    });

    await this.audit.logEvent({
      action: 'escrow.release',
      actorId: trip.driverId || undefined,
      actorType: 'driver',
      reference: trip.paystackReference || `escrow_rel_${tripId}`,
      amount: trip.totalFare,
      beforeStatus: 'held',
      afterStatus: 'released',
      metadata: { tripId },
    });

    this.logger.log(`Logical escrow released for tripId=${tripId}`);
  }

  /**
   * Refunding a payment transaction reference.
   */
  async refund(
    reference: string,
    amount?: Kobo,
    options?: { actorId?: string; actorType?: 'passenger' | 'driver' | 'admin' },
  ): Promise<{ refundReference: string }> {
    const trip = await this.prisma.trip.findUnique({
      where: { paystackReference: reference },
    });

    if (!trip) {
      throw new AppException('NOT_FOUND', undefined, 'Trip with this reference not found');
    }

    // Call Paystack Refund API
    const refundData = await this.paystack.refundTransaction(reference, amount);

    await this.prisma.trip.update({
      where: { id: trip.id },
      data: { paymentStatus: 'refunded' },
    });

    await this.audit.logEvent({
      action: 'refund.processed',
      actorId: options?.actorId ?? trip.passengerId,
      actorType: options?.actorType ?? 'passenger',
      reference,
      amount: amount || trip.totalFare,
      beforeStatus: trip.paymentStatus,
      afterStatus: 'refunded',
      metadata: { refundReference: refundData.refund_reference },
    });

    return {
      refundReference: refundData.refund_reference,
    };
  }

  /**
   * Verification, idempotency check, and routing of Paystack webhooks.
   */
  async handleWebhook(rawBody: Buffer, signature: string): Promise<WebhookAck> {
    // 1. Signature verification
    if (!signature) {
      throw new UnauthorizedException('Missing Paystack signature header');
    }

    const computedSignature = createHmac('sha512', this.paystackSecret)
      .update(rawBody)
      .digest('hex');

    const signatureBuffer = Buffer.from(signature, 'hex');
    const computedBuffer = Buffer.from(computedSignature, 'hex');

    if (
      signatureBuffer.length !== computedBuffer.length ||
      !timingSafeEqual(signatureBuffer, computedBuffer)
    ) {
      this.logger.warn('Webhook signature verification failed');
      throw new UnauthorizedException('Signature verification failed');
    }

    // Parse event body
    const bodyString = rawBody.toString('utf8');
    const event = JSON.parse(bodyString);
    const eventType = event.event;
    const data = event.data;
    const reference = data.reference || data.domain || `ev_${Date.now()}`;

    this.logger.log(`Received Paystack Webhook event: ${eventType} with ref: ${reference}`);

    // 2. Idempotency Check: Save key in Redis for 7 days (604800 seconds)
    const redisKey = `webhook:${reference}:${eventType}`;
    const isNew = await this.redis.setNx(redisKey, '1', 604800);
    if (!isNew) {
      this.logger.log(`Webhook already processed: ${eventType} | ref=${reference}`);
      return { received: true };
    }

    // 3. Process event asynchronously to return 200 OK immediately to Paystack
    this.processWebhookEventAsync(eventType, data, reference).catch((err) => {
      this.logger.error(`Error processing webhook event ${eventType} async: ${err.message}`, err.stack);
    });

    return { received: true };
  }

  /**
   * Async event processor.
   */
  private async processWebhookEventAsync(eventType: string, data: any, reference: string): Promise<void> {
    switch (eventType) {
      case 'charge.success': {
        const amount = data.amount; // in kobo
        const trip = await this.prisma.trip.findUnique({
          where: { paystackReference: reference },
        });

        if (!trip) {
          this.logger.warn(`Trip not found for charge.success reference=${reference}`);
          return;
        }

        // Reconcile amounts to prevent client manipulation
        if (amount !== trip.totalFare) {
          this.logger.error(
            `Amount mismatch in charge.success! Trip totalFare: ${trip.totalFare}, Paystack amount: ${amount}`,
          );
          // Set state to failed/compromised or handle accordingly
          await this.prisma.trip.update({
            where: { id: trip.id },
            data: { paymentStatus: 'failed' },
          });
          return;
        }

        // Set trip paymentStatus to 'held' (Logical Escrow hold)
        await this.prisma.trip.update({
          where: { id: trip.id },
          data: { paymentStatus: 'held' },
        });

        await this.audit.logEvent({
          action: 'charge.success',
          actorId: trip.passengerId,
          actorType: 'passenger',
          reference,
          amount,
          beforeStatus: 'pending',
          afterStatus: 'held',
          metadata: { tripId: trip.id },
        });
        break;
      }

      case 'transfer.success': {
        // Find transfer audit
        const audit = await this.prisma.financialAudit.findUnique({
          where: { reference },
        });
        if (audit) {
          await this.audit.logEvent({
            action: 'transfer.success',
            actorId: audit.actorId || undefined,
            actorType: 'driver',
            reference,
            amount: audit.amount || undefined,
            beforeStatus: 'processing',
            afterStatus: 'success',
            metadata: { paystackData: data },
          });
        }
        break;
      }

      case 'transfer.failed': {
        // Find transfer audit
        const audit = await this.prisma.financialAudit.findUnique({
          where: { reference },
        });
        if (audit) {
          await this.audit.logEvent({
            action: 'transfer.failed',
            actorId: audit.actorId || undefined,
            actorType: 'driver',
            reference,
            amount: audit.amount || undefined,
            beforeStatus: 'processing',
            afterStatus: 'failed',
            metadata: { paystackData: data },
          });
        }
        break;
      }

      case 'subscription.create': {
        // subscription details from paystack
        const planCode = data.plan.plan_code;
        const customerEmail = data.customer.email;
        const subscriptionCode = data.subscription_code;
        const nextPaymentDate = new Date(data.next_payment_date);

        // Find driver by email or phone stub email
        let driver = await this.prisma.driver.findFirst({
          where: { email: customerEmail },
        });

        if (!driver && customerEmail.endsWith('@higo.com')) {
          const phone = customerEmail.replace('@higo.com', '');
          driver = await this.prisma.driver.findFirst({ where: { phone } });
        }

        if (!driver) {
          this.logger.warn(`Driver not found for subscription.create email=${customerEmail}`);
          return;
        }

        // Determine tier from planCode
        let tier: SubscriptionTier = SubscriptionTier.DAILY;
        if (planCode === this.config.get('PAYSTACK_PLAN_WEEKLY')) {
          tier = SubscriptionTier.WEEKLY;
        } else if (planCode === this.config.get('PAYSTACK_PLAN_MONTHLY')) {
          tier = SubscriptionTier.MONTHLY;
        }

        // Update driver subscription
        await this.prisma.driver.update({
          where: { id: driver.id },
          data: {
            subscriptionTier: tier,
            subscriptionExpiresAt: nextPaymentDate,
          },
        });

        // Find active subscription log or update
        await this.prisma.subscription.updateMany({
          where: {
            driverId: driver.id,
            isActive: false,
          },
          data: {
            paystackSubscriptionCode: subscriptionCode,
            isActive: true,
            expiresAt: nextPaymentDate,
          },
        });

        await this.audit.logEvent({
          action: 'subscription.create',
          actorId: driver.id,
          actorType: 'driver',
          reference: subscriptionCode,
          amount: data.amount,
          beforeStatus: 'inactive',
          afterStatus: 'active',
          metadata: { tier, planCode },
        });
        break;
      }

      case 'invoice.payment_failed': {
        const customerEmail = data.customer.email;
        // Mark subscription at risk
        let driver = await this.prisma.driver.findFirst({
          where: { email: customerEmail },
        });

        if (!driver && customerEmail.endsWith('@higo.com')) {
          const phone = customerEmail.replace('@higo.com', '');
          driver = await this.prisma.driver.findFirst({ where: { phone } });
        }

        if (driver) {
          await this.prisma.driver.update({
            where: { id: driver.id },
            data: { subscriptionExpiresAt: new Date() }, // expire immediately to gate go-online
          });

          await this.prisma.subscription.updateMany({
            where: { driverId: driver.id, isActive: true },
            data: { isActive: false },
          });

          await this.audit.logEvent({
            action: 'subscription.expire',
            actorId: driver.id,
            actorType: 'driver',
            reference: `failed_inv_${Date.now()}`,
            beforeStatus: 'active',
            afterStatus: 'expired',
            metadata: { paystackData: data },
          });
        }
        break;
      }

      case 'refund.processed': {
        const amount = data.amount;
        const trip = await this.prisma.trip.findUnique({
          where: { paystackReference: reference },
        });

        if (trip) {
          await this.prisma.trip.update({
            where: { id: trip.id },
            data: { paymentStatus: 'refunded' },
          });

          await this.audit.logEvent({
            action: 'refund.processed',
            actorId: trip.passengerId,
            actorType: 'passenger',
            reference,
            amount,
            beforeStatus: trip.paymentStatus,
            afterStatus: 'refunded',
          });
        }
        break;
      }

      default:
        this.logger.log(`Unhandled webhook event type: ${eventType}`);
    }
  }
}
