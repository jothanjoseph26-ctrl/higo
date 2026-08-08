import { Controller, Post, Put, Body, Get, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { GetNearbyDriversResponse } from '@higo/shared-types';
import { PresenceService } from '../realtime/presence.service';
import { PostDriverLocationDto } from '../trips/dto/trip.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user';
import { AppException } from '../common/errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { NearbyDriversQueryDto } from './dto/nearby-drivers-query.dto';
import { HceService } from '../hce/hce.service';

const TRAINING_MODULES = [
  { key: 'safety_basics', title: 'Safety basics', required: true },
  { key: 'service_quality', title: 'Service quality', required: true },
  { key: 'payments_and_escrow', title: 'Payments and escrow', required: true },
  { key: 'voice_dispatch', title: 'Voice dispatch', required: false },
];

@Controller('drivers')
export class DriversController {
  constructor(
    private readonly presenceService: PresenceService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly hce: HceService,
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
      if (!this.hasActiveSubscriptionOrGrace(driver.subscriptionExpiresAt, driver.createdAt)) {
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
  async voiceConfirm(
    @CurrentUser() user: AuthUser,
    @Body() dto: { transcript?: string; command?: string; tripId?: string },
  ) {
    if (user.type !== 'driver') {
      throw new AppException('FORBIDDEN', undefined, 'Only drivers can confirm via voice');
    }

    if (dto.tripId) {
      const trip = await this.prisma.trip.findFirst({
        where: { id: dto.tripId, driverId: user.sub },
        select: { id: true },
      });
      if (!trip) {
        throw new AppException('FORBIDDEN', undefined, 'Trip is not assigned to this driver');
      }
    }

    return this.hce.intent(user, {
      text: dto.command,
      transcript: dto.transcript,
      context: dto.tripId ? `trip:${dto.tripId}` : undefined,
    });
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

    const completed = await this.prisma.driverTrainingCompletion.findMany({
      where: { driverId: user.sub },
      orderBy: { completedAt: 'desc' },
    });
    const completedKeys = new Set(completed.map((item) => item.moduleKey));
    const modules = TRAINING_MODULES.map((module) => {
      const completion = completed.find((item) => item.moduleKey === module.key);
      return {
        ...module,
        completed: completedKeys.has(module.key),
        completedAt: completion?.completedAt ?? null,
        score: completion?.score ?? null,
      };
    });
    const modulesCompleted = modules.filter((module) => module.completed).length;
    return {
      modulesCompleted,
      totalModules: TRAINING_MODULES.length,
      completionPercentage: Math.round((modulesCompleted / TRAINING_MODULES.length) * 100),
      modules,
    };
  }

  @Post('training/progress')
  async recordDriverTrainingProgress(
    @CurrentUser() user: AuthUser,
    @Body() dto: { moduleKey?: string; moduleId?: string; score?: number; metadata?: Record<string, unknown> },
  ) {
    if (user.type !== 'driver') {
      throw new AppException('FORBIDDEN', undefined, 'Only drivers can update training progress');
    }

    const moduleKey = dto.moduleKey ?? dto.moduleId;
    if (!moduleKey || !TRAINING_MODULES.some((module) => module.key === moduleKey)) {
      throw new AppException('VALIDATION_ERROR', undefined, 'Unknown training module');
    }

    await this.prisma.driverTrainingCompletion.upsert({
      where: { driverId_moduleKey: { driverId: user.sub, moduleKey } },
      create: {
        driverId: user.sub,
        moduleKey,
        score: dto.score,
        metadata: dto.metadata,
      },
      update: {
        completedAt: new Date(),
        score: dto.score,
        metadata: dto.metadata,
      },
    });

    return this.getDriverTrainingProgress(user);
  }

  @Get('voice-commands')
  async getDriverVoiceCommands(@CurrentUser() user: AuthUser) {
    if (user.type !== 'driver') {
      throw new AppException('FORBIDDEN', undefined, 'Only drivers can access voice commands');
    }
    const driver = await this.prisma.driver.findUnique({
      where: { id: user.sub },
      select: { kycStatus: true, subscriptionExpiresAt: true, isSuspended: true, createdAt: true },
    });
    return {
      commands: [
        { intent: 'accept', phrases: ['accept', 'yes', 'karba', 'gba', 'confirm'] },
        { intent: 'decline', phrases: ['decline', 'no', 'ki', 'ko', 'reject'] },
      ],
      available: Boolean(
        driver &&
          driver.kycStatus === 'approved' &&
          this.hasActiveSubscriptionOrGrace(driver.subscriptionExpiresAt, driver.createdAt) &&
          !driver.isSuspended,
      ),
    };
  }

  private hasActiveSubscriptionOrGrace(
    subscriptionExpiresAt: Date | null,
    driverCreatedAt: Date,
  ): boolean {
    if (subscriptionExpiresAt && new Date(subscriptionExpiresAt) > new Date()) {
      return true;
    }

    const graceDays = this.config.get<number>('DRIVER_SUBSCRIPTION_GRACE_DAYS') ?? 14;
    if (graceDays <= 0) return false;

    const graceExpiresAt = new Date(driverCreatedAt);
    graceExpiresAt.setDate(graceExpiresAt.getDate() + graceDays);
    return graceExpiresAt > new Date();
  }
}
