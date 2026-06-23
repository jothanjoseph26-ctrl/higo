import { Controller, Post, Put, Body } from '@nestjs/common';
import { PresenceService } from '../realtime/presence.service';
import { PostDriverLocationDto } from './dto/trip.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user';
import { AppException } from '../common/errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';

@Controller('drivers')
export class DriversController {
  constructor(
    private readonly presenceService: PresenceService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('location')
  async updateLocation(
    @CurrentUser() user: AuthUser,
    @Body() dto: PostDriverLocationDto,
  ) {
    if (user.type !== 'driver') {
      throw new AppException('FORBIDDEN', undefined, 'Only drivers can update location');
    }

    await this.presenceService.updateDriverLocation(
      user.sub,
      dto.lat,
      dto.lng,
      dto.bearing,
      dto.speed,
    );

    return { accepted: true };
  }

  @Put('online-status')
  async updateOnlineStatus(
    @CurrentUser() user: AuthUser,
    @Body() dto: { isOnline: boolean },
  ) {
    if (user.type !== 'driver') {
      throw new AppException('FORBIDDEN', undefined, 'Only drivers can toggle online status');
    }

    const driver = await this.prisma.driver.findUnique({
      where: { id: user.sub },
    });

    if (!driver) {
      throw new AppException('NOT_FOUND', undefined, 'Driver profile not found');
    }

    if (dto.isOnline) {
      // 1. Check KYC status
      if (driver.kycStatus !== 'approved') {
        throw new AppException('KYC_INCOMPLETE');
      }

      // 2. Check Subscription
      if (!driver.subscriptionExpiresAt || new Date(driver.subscriptionExpiresAt) < new Date()) {
        throw new AppException('SUBSCRIPTION_EXPIRED');
      }

      // 3. Check Suspended
      if (driver.isSuspended) {
        throw new AppException('DRIVER_SUSPENDED');
      }
    }

    // Update database
    await this.prisma.driver.update({
      where: { id: user.sub },
      data: { isOnline: dto.isOnline },
    });

    return { isOnline: dto.isOnline };
  }

  @Post('voice-confirm')
  async voiceConfirm(@CurrentUser() user: AuthUser) {
    if (user.type !== 'driver') {
      throw new AppException('FORBIDDEN', undefined, 'Only drivers can confirm via voice');
    }

    // Phase 1 backend stub VoiceService.processCommand
    const rand = Math.random();
    const intent = rand < 0.7 ? 'accept' : rand < 0.9 ? 'decline' : 'unclear';

    return { intent };
  }
}
