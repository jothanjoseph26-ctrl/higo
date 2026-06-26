import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { AdminFinancialController } from './admin-financial.controller';
import { AdminFinanceController } from './admin-finance.controller';
import { AdminFinanceService } from './admin-finance.service';
import { PaymentService } from './payment.service';
import { DisbursementService } from './disbursement.service';
import { SubscriptionService } from './subscription.service';
import { EarningsService } from './earnings.service';
import { PaystackClient } from './paystack/paystack.client';
import { WebhookHandler } from './webhooks/webhook.handler';
import { FinancialAuditService } from './audit/financial-audit.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { CryptoModule } from '../common/crypto/crypto.module';

@Module({
  imports: [PrismaModule, RedisModule, CryptoModule],
  controllers: [PaymentsController, AdminFinancialController, AdminFinanceController],
  providers: [
    AdminFinanceService,
    PaymentService,
    DisbursementService,
    SubscriptionService,
    EarningsService,
    PaystackClient,
    WebhookHandler,
    FinancialAuditService,
  ],
  exports: [PaymentService, SubscriptionService, DisbursementService, EarningsService, AdminFinanceService],
})
export class PaymentsModule {}
