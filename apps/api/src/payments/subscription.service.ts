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
    // Must match the prices actually shown to drivers before checkout -
    // Base44's DriverSubscription.jsx plans array: Daily ₦200, Weekly
    // ₦1,000, Monthly ₦2,000. This previously charged ₦500/₦3,000/₦10,000 -
    // 2.5x-5x what was displayed - a real overcharge on every subscription
    // purchased, not a display bug.
    if (tier === SubscriptionTier.DAILY) return 20000;
    if (tier === SubscriptionTier.WEEKLY) return 100000;
    return 200000;
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

  async applyCoupon(
    driverId: string,
    code: string,
  ): Promise<{ success: boolean; message: string; expiresAt: string }> {
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode) {
      throw new AppException('VALIDATION_ERROR', undefined, 'Coupon code is required');
    }

    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) {
      throw new AppException('NOT_FOUND', undefined, 'Driver not found');
    }

    const coupon = await this.prisma.subscriptionCoupon.findUnique({
      where: { code: normalizedCode },
    });
    const now = new Date();
    if (!coupon || !coupon.isActive) {
      throw new AppException('VALIDATION_ERROR', undefined, 'Invalid or expired coupon code');
    }
    if (coupon.validFrom && coupon.validFrom > now) {
      throw new AppException('VALIDATION_ERROR', undefined, 'This coupon is not yet active');
    }
    if (coupon.validUntil && coupon.validUntil < now) {
      throw new AppException('VALIDATION_ERROR', undefined, 'This coupon has expired');
    }
    if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) {
      throw new AppException('VALIDATION_ERROR', undefined, 'This coupon has reached its usage limit');
    }

    if (coupon.maxUsesPerUser > 0) {
      const usedByDriver = await this.prisma.subscriptionCouponRedemption.count({
        where: { couponId: coupon.id, driverId },
      });
      if (usedByDriver >= coupon.maxUsesPerUser) {
        throw new AppException('VALIDATION_ERROR', undefined, 'You have already used this coupon');
      }
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + coupon.durationDays);

    await this.prisma.$transaction([
      this.prisma.driver.update({
        where: { id: driverId },
        data: {
          subscriptionTier: coupon.plan,
          subscriptionExpiresAt: expiresAt,
        },
      }),
      this.prisma.subscriptionCoupon.update({
        where: { id: coupon.id },
        data: { usedCount: { increment: 1 } },
      }),
      this.prisma.subscriptionCouponRedemption.create({
        data: {
          couponId: coupon.id,
          driverId,
          userId: driver.userId,
        },
      }),
      this.prisma.subscription.create({
        data: {
          driverId,
          tier: coupon.plan,
          amount: 0,
          isActive: true,
          autoRenew: false,
          expiresAt,
        },
      }),
    ]);

    await this.audit.logEvent({
      action: 'subscription.coupon_applied',
      actorId: driverId,
      actorType: 'driver',
      reference: `COUPON-${normalizedCode}-${Date.now()}`,
      amount: 0,
      beforeStatus: 'inactive',
      afterStatus: 'active',
      metadata: { couponId: coupon.id, code: normalizedCode, tier: coupon.plan },
    });

    return {
      success: true,
      message: `Free ${coupon.plan} subscription activated for ${coupon.durationDays} days`,
      expiresAt: expiresAt.toISOString(),
    };
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
