import { Controller, Post, Put, Body, Get, Query } from '@nestjs/common';
import type { GetNearbyDriversResponse } from '@higo/shared-types';
import { PresenceService } from '../realtime/presence.service';
import { PostDriverLocationDto } from '../trips/dto/trip.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user';
import { AppException } from '../common/errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { NearbyDriversQueryDto } from './dto/nearby-drivers-query.dto';

@Controller('drivers')
export class DriversController {
  constructor(
    private readonly presenceService: PresenceService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('nearby')
  async getNearbyDrivers(
    @Query() query: NearbyDriversQueryDto,
  ): Promise<GetNearbyDriversResponse> {
    const drivers = await this.presenceService.getNearbyOnlineDrivers(
      query.lat,
      query.lng,
      query.radiusKm,
    );
    return { drivers };
  }

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
      if (driver.kycStatus !== 'approved') {
        throw new AppException('KYC_INCOMPLETE');
      }
      if (!driver.subscriptionExpiresAt || new Date(driver.subscriptionExpiresAt) < new Date()) {
        throw new AppException('SUBSCRIPTION_EXPIRED');
      }
      if (driver.isSuspended) {
        throw new AppException('DRIVER_SUSPENDED');
      }
    }

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
    const rand = Math.random();
    const intent = rand < 0.7 ? 'accept' : rand < 0.9 ? 'decline' : 'unclear';
    return { intent };
  }

  @Get('me')
  async getDriverProfile(@CurrentUser() user: AuthUser) {
    if (user.type !== 'driver') {
      throw new AppException('FORBIDDEN', undefined, 'Only drivers can access their profile');
    }

    const driver = await this.prisma.driver.findUnique({
      where: { id: user.sub },
    });

    if (!driver) {
      throw new AppException('NOT_FOUND', undefined, 'Driver profile not found');
    }

    return {
      id: driver.id,
      userId: driver.userId,
      name: driver.name,
      phone: driver.phone,
      email: driver.email,
      avatarUrl: driver.avatarUrl,
      vehicleType: driver.vehicleType,
      vehiclePlate: driver.vehiclePlate,
      vehicleModel: driver.vehicleModel,
      vehicleColor: driver.vehicleColor,
      vehicleYear: driver.vehicleYear,
      kycStatus: driver.kycStatus,
      isOnline: driver.isOnline,
      subscriptionTier: driver.subscriptionTier,
      subscriptionExpiresAt: driver.subscriptionExpiresAt,
      isSuspended: driver.isSuspended,
      ratingAvg: driver.ratingAvg,
      totalTrips: driver.totalTrips,
      higoPoints: driver.higoPoints,
      createdAt: driver.createdAt,
    };
  }

  @Put('me')
  async updateDriverProfile(
    @CurrentUser() user: AuthUser,
    @Body()
    dto: {
      name?: string;
      vehiclePlate?: string;
      vehicleModel?: string;
      vehicleColor?: string;
      vehicleYear?: number;
      vehicleType?: string;
      fcmToken?: string;
    },
  ) {
    if (user.type !== 'driver') {
      throw new AppException('FORBIDDEN', undefined, 'Only drivers can update their profile');
    }

    const driver = await this.prisma.driver.update({
      where: { id: user.sub },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.vehiclePlate && { vehiclePlate: dto.vehiclePlate }),
        ...(dto.vehicleModel && { vehicleModel: dto.vehicleModel }),
        ...(dto.vehicleColor && { vehicleColor: dto.vehicleColor }),
        ...(dto.vehicleYear && { vehicleYear: dto.vehicleYear }),
        ...(dto.vehicleType && { vehicleType: dto.vehicleType as any }),
        ...(dto.fcmToken !== undefined && { fcmToken: dto.fcmToken }),
      },
    });

    return {
      id: driver.id,
      userId: driver.userId,
      name: driver.name,
      phone: driver.phone,
      email: driver.email,
      vehicleType: driver.vehicleType,
      vehiclePlate: driver.vehiclePlate,
      vehicleModel: driver.vehicleModel,
      vehicleColor: driver.vehicleColor,
      vehicleYear: driver.vehicleYear,
      kycStatus: driver.kycStatus,
      isOnline: driver.isOnline,
      subscriptionTier: driver.subscriptionTier,
      isSuspended: driver.isSuspended,
      ratingAvg: driver.ratingAvg,
      totalTrips: driver.totalTrips,
      createdAt: driver.createdAt,
    };
  }

  @Get('trips')
  async getDriverTrips(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
    @Query('limit') limit: number = 10,
    @Query('offset') offset: number = 0,
  ) {
    if (user.type !== 'driver') {
      throw new AppException('FORBIDDEN', undefined, 'Only drivers can access their trips');
    }

    const where: any = { driverId: user.sub };
    if (status) where.status = status;

    const [trips, total] = await Promise.all([
      this.prisma.trip.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.trip.count({ where }),
    ]);

    return { trips, total, limit, offset };
  }

  @Get('training/progress')
  async getDriverTrainingProgress(@CurrentUser() user: AuthUser) {
    if (user.type !== 'driver') {
      throw new AppException('FORBIDDEN', undefined, 'Only drivers can access training progress');
    }
    return { modulesCompleted: 0, totalModules: 0, completionPercentage: 0 };
  }

  @Get('voice-commands')
  async getDriverVoiceCommands(@CurrentUser() user: AuthUser) {
    if (user.type !== 'driver') {
      throw new AppException('FORBIDDEN', undefined, 'Only drivers can access voice commands');
    }
    return { commands: [] };
  }
}
