import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user';
import { SubscriptionService } from './subscription.service';
import { CreateCouponDto, UpdateCouponDto } from './dto/coupon.dto';

@Controller('admin/coupons')
@Roles('admin', 'super_admin')
@UseGuards(RolesGuard)
export class AdminCouponsController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get()
  async list() {
    return this.subscriptionService.listCoupons();
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateCouponDto) {
    return this.subscriptionService.createCoupon(user.sub, dto);
  }

  @Put(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCouponDto,
  ) {
    return this.subscriptionService.updateCoupon(user.sub, id, dto);
  }
}
