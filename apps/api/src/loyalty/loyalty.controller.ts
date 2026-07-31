import { Body, Controller, Get, Post } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user';
import { LoyaltyService } from './loyalty.service';

@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get('me')
  async getMe(@CurrentUser() user: AuthUser) {
    this.assertPassenger(user);
    return { account: await this.loyalty.getOrCreate(user.sub) };
  }

  @Post('award')
  async award(@CurrentUser() user: AuthUser, @Body() dto: { points?: number; tripId?: string; trip_id?: string }) {
    this.assertPassenger(user);
    return this.loyalty.award(user.sub, dto.points ?? 10, dto.tripId ?? dto.trip_id);
  }

  @Post('redeem')
  async redeem(@CurrentUser() user: AuthUser, @Body() dto: { points?: number }) {
    this.assertPassenger(user);
    return this.loyalty.redeem(user.sub, dto.points ?? 0);
  }

  private assertPassenger(user: AuthUser) {
    if (user.type !== 'passenger') {
      throw new AppException('FORBIDDEN', undefined, 'Only passengers can use loyalty');
    }
  }
}
