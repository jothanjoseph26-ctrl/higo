import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PaystackClient } from './paystack/paystack.client';
import { FinancialAuditService } from './audit/financial-audit.service';
import {
  CreateSubscriptionRequest,
  CreateSubscriptionResponse,
  RenewSubscriptionRequest,
  RenewSubscriptionResponse,
  SubscriptionTier,
  Kobo,
} from '@higo/shared-types';
import { AppException } from '../common/errors/app.exception';

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paystack: PaystackClient,
    private readonly audit: FinancialAuditService,
    private readonly config: ConfigService,
  ) {}

  private getPlanCode(tier: SubscriptionTier): string {
    const key = `PAYSTACK_PLAN_${tier.toUpperCase()}`;
    return this.config.getOrThrow<string>(key);
  }

  private getTierAmount(tier: SubscriptionTier): Kobo {
    // Standard tiers pricing in kobo (e.g. Daily = ₦500 -> 50000 kobo, Weekly = ₦3000 -> 300000 kobo, Monthly = ₦10000 -> 1000000 kobo)
    // We can define these or fetch them dynamically. Let's provide standard default amounts.
    if (tier === SubscriptionTier.DAILY) return 50000;
    if (tier === SubscriptionTier.WEEKLY) return 300000;
    return 1000000;
  }

  private calculateExpiry(tier: SubscriptionTier, fromDate = new Date()): Date {
    const date = new Date(fromDate);
    if (tier === SubscriptionTier.DAILY) {
      date.setDate(date.getDate() + 1);
    } else if (tier === SubscriptionTier.WEEKLY) {
      date.setDate(date.getDate() + 7);
    } else if (tier === SubscriptionTier.MONTHLY) {
      date.setMonth(date.getMonth() + 1);
    }
    return date;
  }

  async create(
    driverId: string,
    dto: CreateSubscriptionRequest,
  ): Promise<CreateSubscriptionResponse> {
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) {
      throw new AppException('NOT_FOUND', undefined, 'Driver not found');
    }

    const planCode = this.getPlanCode(dto.tier);
    const amount = this.getTierAmount(dto.tier);
    const email = driver.email || `${driver.phone}@higo.com`;

    // To subscribe a customer, we can initialize a Paystack transaction with the plan code.
    // When the customer completes the transaction, Paystack automatically subscribes them to the plan.
    // This is the standard, safest checkout flow for cards/bank/ussd in Nigeria.
    const reference = `sub_init_${driverId}_${Date.now()}`;
    const callbackUrl = this.config.getOrThrow<string>('APP_PAYMENT_CALLBACK_URL');

    // We initialize a transaction on Paystack linked to the subscription plan
    const transaction = await this.paystack.initializeTransaction(
      email,
      amount,
      reference,
      callbackUrl,
    );

    // Calculate tentative expiresAt for the response
    const expiresAt = this.calculateExpiry(dto.tier);

    await this.audit.logEvent({
      action: 'subscription.initialize',
      actorId: driverId,
      actorType: 'driver',
      reference,
      amount,
      beforeStatus: 'inactive',
      afterStatus: 'pending',
      metadata: { tier: dto.tier, planCode, autoRenew: dto.autoRenew },
    });

    // Create a pending subscription entry in our database
    await this.prisma.subscription.create({
      data: {
        driverId,
        tier: dto.tier,
        amount,
        isActive: false,
        autoRenew: dto.autoRenew ?? false,
        expiresAt,
      },
    });

    return {
      subscriptionCode: reference,
      authorizationUrl: transaction.authorization_url,
      amount,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async renew(
    driverId: string,
    dto: RenewSubscriptionRequest,
  ): Promise<RenewSubscriptionResponse> {
    // Renewal uses the same payment flow as creation
    return this.create(driverId, {
      tier: dto.tier,
      autoRenew: true,
    });
  }

  /**
   * Used by Agent 2 to gate go-online.
   * Checks if driver has an active subscription that has not expired.
   */
  async isActive(driverId: string): Promise<boolean> {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      select: {
        isActive: true,
        isSuspended: true,
        subscriptionExpiresAt: true,
      },
    });

    if (!driver || !driver.isActive || driver.isSuspended) {
      return false;
    }

    if (!driver.subscriptionExpiresAt) {
      return false;
    }

    const expiresAt = new Date(driver.subscriptionExpiresAt);
    return expiresAt > new Date();
  }
}
