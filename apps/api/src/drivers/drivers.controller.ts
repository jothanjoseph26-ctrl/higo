import { Controller, Post, Put, Body, Get, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { PresenceService } from '../realtime/presence.service';
import { PostDriverLocationDto } from '../trips/dto/trip.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user';
import { AppException } from '../common/errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { GetDriverProfileResponse, UpdateDriverProfileRequest, GetDriverEarningsResponse, GetDriverTripsResponse, DriverTrainingProgressResponse, GetDriverVoiceCommandsResponse } from '@higo/shared-types';

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

  @Get('me')
  async getDriverProfile(@CurrentUser() user: AuthUser): Promise<GetDriverProfileResponse> {
    if (user.type !== 'driver') {
      throw new AppException('FORBIDDEN', undefined, 'Only drivers can access their profile');
    }

    const driver = await this.prisma.driver.findUnique({
      where: { id: user.sub },
      include: {
        user: true,
        vehicle: true,
        subscription: true,
        kycDocuments: true,
      },
    });

    if (!driver) {
      throw new AppException('NOT_FOUND', undefined, 'Driver profile not found');
    }

    return {
      id: driver.id,
      userId: driver.userId,
      vehicleId: driver.vehicleId,
      licenseNumber: driver.licenseNumber,
      vehiclePlate: driver.vehiclePlate,
      vehicleModel: driver.vehicleModel,
      vehicleColor: driver.vehicleColor,
      kycStatus: driver.kycStatus,
      isOnline: driver.isOnline,
      subscriptionTier: driver.subscriptionTier,
      subscriptionExpiresAt: driver.subscriptionExpiresAt,
      isSuspended: driver.isSuspended,
      rating: driver.rating,
      totalTrips: driver.totalTrips,
      createdAt: driver.createdAt,
      user: driver.user,
    };
  }

  @Put('me')
  async updateDriverProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateDriverProfileRequest,
  ): Promise<GetDriverProfileResponse> {
    if (user.type !== 'driver') {
      throw new AppException('FORBIDDEN', undefined, 'Only drivers can update their profile');
    }

    const driver = await this.prisma.driver.update({
      where: { id: user.sub },
      data: {
        licenseNumber: dto.licenseNumber,
        vehiclePlate: dto.vehiclePlate,
        vehicleModel: dto.vehicleModel,
        vehicleColor: dto.vehicleColor,
      },
      include: {
        user: true,
        vehicle: true,
        subscription: true,
        kycDocuments: true,
      },
    });

    return {
      id: driver.id,
      userId: driver.userId,
      vehicleId: driver.vehicleId,
      licenseNumber: driver.licenseNumber,
      vehiclePlate: driver.vehiclePlate,
      vehicleModel: driver.vehicleModel,
      vehicleColor: driver.vehicleColor,
      kycStatus: driver.kycStatus,
      isOnline: driver.isOnline,
      subscriptionTier: driver.subscriptionTier,
      subscriptionExpiresAt: driver.subscriptionExpiresAt,
      isSuspended: driver.isSuspended,
      rating: driver.rating,
      totalTrips: driver.totalTrips,
      createdAt: driver.createdAt,
      user: driver.user,
    };
  }

  @Get('earnings')
  @Roles('admin', 'super_admin')
  async getDriverEarnings(
    @CurrentUser() user: AuthUser,
    @Query('period') period: 'daily' | 'weekly' | 'monthly' = 'daily',
  ): Promise<GetDriverEarningsResponse> {
    if (user.type !== 'driver' && user.type !== 'admin' && user.type !== 'super_admin') {
      throw new AppException('FORBIDDEN', undefined, 'Only admins and drivers can access earnings');
    }

    const driverId = user.type === 'driver' ? user.sub : user.driverId;

    // Get earnings data
    const earnings = await this.prisma.earnings.aggregate({
      where: {
        driverId: driverId,
        period: period,
        status: 'paid',
      },
      _sum: {
        amount: true,
      },
      _count: {
        id: true,
      },
    });

    return {
      totalEarnings: earnings._sum.amount || 0,
      period,
      count: earnings._count.id || 0,
    };
  }

  @Get('trips')
  async getDriverTrips(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
    @Query('limit') limit: number = 10,
    @Query('offset') offset: number = 0,
  ): Promise<GetDriverTripsResponse> {
    if (user.type !== 'driver') {
      throw new AppException('FORBIDDEN', undefined, 'Only drivers can access their trips');
    }

    const where: any = {
      driverId: user.sub,
    };

    if (status) {
      where.status = status;
    }

    const [trips, total] = await Promise.all([
      this.prisma.trip.findMany({
        where,
        include: {
          passenger: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.trip.count({ where }),
    ]);

    return {
      trips: trips.map(trip => ({
        id: trip.id,
        passengerId: trip.passengerId,
        passengerName: trip.passenger.name,
        pickupLocation: trip.pickupLocation,
        destinationLocation: trip.destinationLocation,
        status: trip.status,
        vehicleType: trip.vehicleType,
        totalFare: trip.totalFare,
        startedAt: trip.startedAt,
        completedAt: trip.completedAt,
        createdAt: trip.createdAt,
      })),
      total,
      limit,
      offset,
    };
  }

  @Get('training/progress')
  async getDriverTrainingProgress(@CurrentUser() user: AuthUser): Promise<DriverTrainingProgressResponse> {
    if (user.type !== 'driver') {
      throw new AppException('FORBIDDEN', undefined, 'Only drivers can access training progress');
    }

    // Phase 1 stub - return empty progress
    return {
      modulesCompleted: 0,
      totalModules: 0,
      completionPercentage: 0,
    };
  }

  @Get('voice-commands')
  async getDriverVoiceCommands(@CurrentUser() user: AuthUser): Promise<GetDriverVoiceCommandsResponse> {
    if (user.type !== 'driver') {
      throw new AppException('FORBIDDEN', undefined, 'Only drivers can access voice commands');
    }

    // Phase 1 stub - return empty commands
    return {
      commands: [],
    };
  }
}