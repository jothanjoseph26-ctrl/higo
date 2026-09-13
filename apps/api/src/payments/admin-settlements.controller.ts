import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CashSettlementService } from './cash-settlement.service';
import { LedgerService } from './ledger.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser } from '../common/types/auth-user';
import { AppException } from '../common/errors/app.exception';
import {
  GetCashDashboardQuery,
  GetCashDashboardResponse,
  GetDriverSettlementsQuery,
  GetDriverSettlementsResponse,
  ConfirmSettlementRequest,
  ConfirmSettlementResponse,
  UpdateSettlementThresholdRequest,
  GetCashAlertsResponse,
  PaginationQuery,
} from '@higo/shared-types';

@Controller('admin/settlements')
@Roles('admin', 'super_admin')
@UseGuards(RolesGuard)
export class AdminSettlementsController {
  constructor(
    private readonly settlementService: CashSettlementService,
    private readonly ledgerService: LedgerService,
  ) {}

  @Get('dashboard')
  async getDashboard(
    @Query() q: GetCashDashboardQuery,
  ): Promise<GetCashDashboardResponse> {
    return this.settlementService.getCashCollectionDashboard({
      from: q.from,
      to: q.to,
    });
  }

  @Get('drivers')
  async getDriverSettlements(
    @Query() q: GetDriverSettlementsQuery,
  ): Promise<GetDriverSettlementsResponse> {
    return this.settlementService.getDriverSettlements(q);
  }

  @Get('drivers/:driverId/ledger')
  async getDriverLedger(
    @Param('driverId') driverId: string,
    @Query() q: PaginationQuery & { entryType?: string },
  ) {
    return this.ledgerService.getDriverLedger(driverId, {
      ...q,
      entryType: q.entryType as any,
    });
  }

  @Get('drivers/:driverId/wallet')
  async getDriverWallet(@Param('driverId') driverId: string) {
    return this.ledgerService.getWalletBalance(driverId);
  }

  @Post('confirm/:settlementId')
  @HttpCode(HttpStatus.OK)
  async confirmSettlement(
    @CurrentUser() user: AuthUser,
    @Param('settlementId') settlementId: string,
  ): Promise<ConfirmSettlementResponse> {
    return this.settlementService.confirmSettlement(settlementId, user.sub);
  }

  @Put('threshold/:driverId')
  async updateThreshold(
    @Param('driverId') driverId: string,
    @Body() dto: UpdateSettlementThresholdRequest,
  ) {
    await this.settlementService.updateSettlementThreshold(driverId, dto.thresholdKobo);
    return { success: true };
  }

  @Get('alerts')
  async getCashAlerts(
    @Query() q: PaginationQuery,
  ): Promise<GetCashAlertsResponse> {
    return this.settlementService.getCashAlerts(q);
  }
}
