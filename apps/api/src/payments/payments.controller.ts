import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  Req,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { PaymentService } from './payment.service';
import { DisbursementService } from './disbursement.service';
import { SubscriptionService } from './subscription.service';
import { EarningsService } from './earnings.service';
import { WebhookHandler } from './webhooks/webhook.handler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser } from '../common/types/auth-user';
import { AppException } from '../common/errors/app.exception';
import {
  InitializePaymentRequest,
  InitializePaymentResponse,
  CreateSubscriptionRequest,
  CreateSubscriptionResponse,
  RenewSubscriptionRequest,
  RenewSubscriptionResponse,
  WithdrawRequest,
  WithdrawResponse,
  GetEarningsResponse,
  GetEarningsSummaryQuery,
  GetEarningsSummaryResponse,
  FinancialReportQuery,
  FinancialReportResponse,
  WebhookAck,
} from '@higo/shared-types';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly disbursementService: DisbursementService,
    private readonly subscriptionService: SubscriptionService,
    private readonly earningsService: EarningsService,
    private readonly webhookHandler: WebhookHandler,
  ) {}

  @Post('initialize')
  @HttpCode(HttpStatus.OK)
  async initialize(
    @CurrentUser() user: AuthUser,
    @Body() dto: InitializePaymentRequest,
  ): Promise<InitializePaymentResponse> {
    if (user.type !== 'passenger') {
      throw new AppException('FORBIDDEN', undefined, 'Only passengers can initialize payments');
    }
    return this.paymentService.initialize(user.sub, dto);
  }

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: Request,
    @Headers('x-paystack-signature') signature: string,
  ): Promise<WebhookAck> {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody) {
      throw new AppException('VALIDATION_ERROR', undefined, 'Raw body not captured');
    }
    return this.webhookHandler.handlePaystackWebhook(rawBody, signature);
  }

  @Post('refund')
  @Roles('admin', 'super_admin')
  @UseGuards(RolesGuard)
  @HttpCode(HttpStatus.OK)
  async refund(
    @Body('reference') reference: string,
    @Body('amount') amount?: number,
  ): Promise<{ refundReference: string }> {
    return this.paymentService.refund(reference, amount);
  }

  @Post('withdraw')
  @HttpCode(HttpStatus.OK)
  async withdraw(
    @CurrentUser() user: AuthUser,
    @Body() dto: WithdrawRequest,
  ): Promise<WithdrawResponse> {
    if (user.type !== 'driver') {
      throw new AppException('FORBIDDEN', undefined, 'Only drivers can withdraw funds');
    }
    return this.disbursementService.withdraw(user.sub, dto.amount);
  }

  @Post('subscription')
  @HttpCode(HttpStatus.OK)
  async createSubscription(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateSubscriptionRequest,
  ): Promise<CreateSubscriptionResponse> {
    if (user.type !== 'driver') {
      throw new AppException('FORBIDDEN', undefined, 'Only drivers can purchase subscriptions');
    }
    return this.subscriptionService.create(user.sub, dto);
  }

  @Post('subscription/renew')
  @HttpCode(HttpStatus.OK)
  async renewSubscription(
    @CurrentUser() user: AuthUser,
    @Body() dto: RenewSubscriptionRequest,
  ): Promise<RenewSubscriptionResponse> {
    if (user.type !== 'driver') {
      throw new AppException('FORBIDDEN', undefined, 'Only drivers can renew subscriptions');
    }
    return this.subscriptionService.renew(user.sub, dto);
  }

  @Get('earnings')
  async getEarnings(
    @CurrentUser() user: AuthUser,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ): Promise<GetEarningsResponse> {
    if (user.type !== 'driver') {
      throw new AppException('FORBIDDEN', undefined, 'Only drivers can view earnings');
    }
    return this.earningsService.getEarnings(user.sub, { cursor, limit });
  }

  @Get('earnings/summary')
  async getSummary(
    @CurrentUser() user: AuthUser,
    @Query('date') date?: string,
  ): Promise<GetEarningsSummaryResponse> {
    if (user.type !== 'driver') {
      throw new AppException('FORBIDDEN', undefined, 'Only drivers can view earnings summary');
    }
    return this.earningsService.getSummary(user.sub, { date });
  }

  @Get('/admin/financial/report')
  @Roles('admin', 'super_admin')
  @UseGuards(RolesGuard)
  async getFinancialReport(
    @Query() q: FinancialReportQuery,
  ): Promise<FinancialReportResponse> {
    return this.earningsService.getFinancialReport(q);
  }
}
