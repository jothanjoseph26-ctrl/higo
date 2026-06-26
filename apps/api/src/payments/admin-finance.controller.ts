import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { TransactionEntry } from '@higo/shared-types';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user';
import { AdminFinanceService } from './admin-finance.service';

@Controller('admin/finance')
@Roles('admin', 'super_admin')
@UseGuards(RolesGuard)
export class AdminFinanceController {
  constructor(private readonly adminFinanceService: AdminFinanceService) {}

  @Get('transactions')
  async getTransactions(
    @Query('limit') limit: number = 20,
    @Query('offset') offset: number = 0,
    @Query('type') type?: TransactionEntry['type'],
    @Query('status') status?: string,
  ) {
    return this.adminFinanceService.listTransactions(
      Number(limit),
      Number(offset),
      type,
      status,
    );
  }

  @Get('refunds/eligible')
  async getRefundEligible(
    @Query('limit') limit: number = 20,
    @Query('offset') offset: number = 0,
  ) {
    return this.adminFinanceService.listRefundEligible(Number(limit), Number(offset));
  }

  @Post('refunds')
  async processRefund(
    @CurrentUser() admin: AuthUser,
    @Body() dto: { reference: string; amount?: number; reason?: string },
  ) {
    return this.adminFinanceService.processRefund(admin.id, dto);
  }

  @Get('complaints')
  async getComplaints(
    @Query('status') status?: string,
    @Query('limit') limit: number = 20,
    @Query('offset') offset: number = 0,
  ) {
    return this.adminFinanceService.listComplaints(Number(limit), Number(offset), status);
  }
}