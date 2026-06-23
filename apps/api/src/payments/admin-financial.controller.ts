import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { FinancialReportQuery, FinancialReportResponse } from '@higo/shared-types';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { EarningsService } from './earnings.service';

@Controller('admin/financial')
@Roles('admin', 'super_admin')
@UseGuards(RolesGuard)
export class AdminFinancialController {
  constructor(private readonly earningsService: EarningsService) {}

  @Get('report')
  async getFinancialReport(
    @Query() query: FinancialReportQuery,
  ): Promise<FinancialReportResponse> {
    return this.earningsService.getFinancialReport(query);
  }
}
