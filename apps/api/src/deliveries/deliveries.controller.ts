import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user';
import {
  CancelDeliveryDto,
  CompleteDeliveryDto,
  RequestDeliveryDto,
  UpdateDeliveryTrackingDto,
} from './dto/delivery.dto';
import { DeliveriesService } from './deliveries.service';

@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly deliveries: DeliveriesService) {}

  @Post('request')
  async requestDelivery(@CurrentUser() user: AuthUser, @Body() dto: RequestDeliveryDto) {
    if (user.type !== 'passenger') {
      throw new AppException('FORBIDDEN', undefined, 'Only passengers can request deliveries');
    }
    return this.deliveries.requestDelivery(user.sub, dto);
  }

  @Get()
  async listMine(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    if (user.type !== 'passenger' && user.type !== 'driver') {
      throw new AppException('FORBIDDEN', undefined, 'Only delivery parties can list deliveries');
    }
    return this.deliveries.listMine(user, limit, offset);
  }

  @Get(':id/status')
  async status(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.deliveries.assertDeliveryAccess(id, user);
  }

  @Post(':id/cancel')
  async cancel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CancelDeliveryDto,
  ) {
    await this.deliveries.assertDeliveryAccess(id, user);
    return this.deliveries.cancelDelivery(id, dto.reason);
  }

  @Post(':id/pick-up')
  async pickUp(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    if (user.type !== 'driver') {
      throw new AppException('FORBIDDEN', undefined, 'Only riders can pick up deliveries');
    }
    return this.deliveries.markPickedUp(id, user.sub);
  }

  @Post(':id/en-route')
  async enRoute(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    if (user.type !== 'driver') {
      throw new AppException('FORBIDDEN', undefined, 'Only riders can update deliveries');
    }
    return this.deliveries.markEnRoute(id, user.sub);
  }

  @Post(':id/tracking')
  async tracking(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateDeliveryTrackingDto,
  ) {
    if (user.type !== 'driver') {
      throw new AppException('FORBIDDEN', undefined, 'Only riders can update tracking');
    }
    return this.deliveries.updateTracking(id, user.sub, dto);
  }

  @Post(':id/complete')
  async complete(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CompleteDeliveryDto,
  ) {
    if (user.type !== 'driver') {
      throw new AppException('FORBIDDEN', undefined, 'Only riders can complete deliveries');
    }
    return this.deliveries.completeDelivery(id, user.sub, dto);
  }
}
