import { Controller, Get, Post, Put, Delete, Body, Query, Param } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UseGuards } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception';

@Controller('admin')
@Roles('admin', 'super_admin')
@UseGuards(RolesGuard)
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('dashboard/stats')
  async getDashboardStats() {
    const [
      totalDrivers,
      totalPassengers,
      activeTrips,
      completedTrips,
      pendingKyc,
      activeSubscriptions,
    ] = await Promise.all([
      this.prisma.driver.count(),
      this.prisma.user.count({ where: { type: 'passenger' } }),
      this.prisma.trip.count({ where: { status: { in: ['requested', 'matched', 'en_route', 'active'] } } }),
      this.prisma.trip.count({ where: { status: 'completed' } }),
      this.prisma.driver.count({ where: { kycStatus: 'pending' } }),
      this.prisma.subscription.count({ where: { isActive: true } }),
    ]);

    return {
      totalDrivers,
      totalPassengers,
      activeTrips,
      completedTrips,
      pendingKyc,
      activeSubscriptions,
    };
  }

  @Get('drivers')
  async getDrivers(
    @Query('status') status?: string,
    @Query('kycStatus') kycStatus?: string,
    @Query('limit') limit: number = 10,
    @Query('offset') offset: number = 0,
  ) {
    const where: any = {};
    if (status) where.isOnline = status === 'online';
    if (kycStatus) where.kycStatus = kycStatus;

    const [drivers, total] = await Promise.all([
      this.prisma.driver.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.driver.count({ where }),
    ]);

    return { drivers, total, limit, offset };
  }

  @Get('drivers/:id')
  async getDriver(@Param('id') id: string) {
    const driver = await this.prisma.driver.findUnique({ where: { id } });
    if (!driver) throw new AppException('NOT_FOUND', undefined, 'Driver not found');
    return driver;
  }

  @Put('drivers/:id')
  async updateDriver(@Param('id') id: string, @Body() dto: any) {
    return this.prisma.driver.update({ where: { id }, data: dto });
  }

  @Delete('drivers/:id')
  async deleteDriver(@Param('id') id: string) {
    await this.prisma.driver.delete({ where: { id } });
    return { success: true };
  }

  @Get('kyc')
  async getKycPending(
    @Query('status') status?: string,
    @Query('limit') limit: number = 10,
    @Query('offset') offset: number = 0,
  ) {
    const where: any = {};
    if (status) where.kycStatus = status;

    const [drivers, total] = await Promise.all([
      this.prisma.driver.findMany({
        where,
        select: {
          id: true, name: true, phone: true, kycStatus: true,
          verificationTier: true, kycDocuments: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.driver.count({ where }),
    ]);

    return { drivers, total, limit, offset };
  }

  @Put('drivers/:id/kyc')
  async updateDriverKyc(
    @Param('id') id: string,
    @Body() dto: { kycStatus: string },
  ) {
    return this.prisma.driver.update({
      where: { id },
      data: { kycStatus: dto.kycStatus as any },
    });
  }

  @Get('disputes')
  async getDisputes(
    @Query('status') status?: string,
    @Query('limit') limit: number = 10,
    @Query('offset') offset: number = 0,
  ) {
    const where: any = {};
    if (status) where.status = status;

    const [disputes, total] = await Promise.all([
      this.prisma.dispute.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.dispute.count({ where }),
    ]);

    return { disputes, total, limit, offset };
  }

  @Put('disputes/:id')
  async resolveDispute(
    @Param('id') id: string,
    @Body() dto: { status: string; resolution?: string },
  ) {
    return this.prisma.dispute.update({
      where: { id },
      data: {
        status: dto.status as any,
        resolution: dto.resolution,
        resolvedAt: dto.status === 'resolved' ? new Date() : undefined,
      },
    });
  }

  @Get('notifications')
  async getNotifications(
    @Query('limit') limit: number = 10,
    @Query('offset') offset: number = 0,
  ) {
    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.notification.count(),
    ]);

    return { notifications, total, limit, offset };
  }

  @Post('notifications')
  async createNotification(@Body() dto: {
    userId: string; title: string; body: string; type: string; data?: any;
  }) {
    return this.prisma.notification.create({
      data: {
        userId: dto.userId,
        userType: 'passenger',
        title: dto.title,
        body: dto.body,
        type: dto.type,
        data: dto.data,
      },
    });
  }

  @Get('zones')
  async getZones(
    @Query('type') type?: string,
    @Query('limit') limit: number = 10,
    @Query('offset') offset: number = 0,
  ) {
    const where: any = {};
    if (type) where.zoneType = type;

    const [zones, total] = await Promise.all([
      this.prisma.zone.findMany({
        where,
        orderBy: { name: 'asc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.zone.count({ where }),
    ]);

    return { zones, total, limit, offset };
  }

  @Get('pricing')
  async getPricing(
    @Query('vehicleType') vehicleType?: string,
    @Query('limit') limit: number = 10,
    @Query('offset') offset: number = 0,
  ) {
    const where: any = {};
    if (vehicleType) where.vehicleType = vehicleType;

    const [pricing, total] = await Promise.all([
      this.prisma.pricingConfig.findMany({
        where,
        orderBy: { vehicleType: 'asc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.pricingConfig.count({ where }),
    ]);

    return { pricing, total, limit, offset };
  }

  @Put('pricing/:id')
  async updatePricing(@Param('id') id: string, @Body() dto: any) {
    return this.prisma.pricingConfig.update({ where: { id }, data: dto });
  }

  @Get('users')
  async getUsers(
    @Query('type') type?: string,
    @Query('limit') limit: number = 10,
    @Query('offset') offset: number = 0,
  ) {
    const where: any = {};
    if (type) where.type = type;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true, name: true, email: true, phone: true,
          type: true, isBlocked: true, totalTrips: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users, total, limit, offset };
  }

  @Put('users/:id/block')
  async blockUser(@Param('id') id: string) {
    return this.prisma.user.update({ where: { id }, data: { isBlocked: true } });
  }

  @Put('users/:id/unblock')
  async unblockUser(@Param('id') id: string) {
    return this.prisma.user.update({ where: { id }, data: { isBlocked: false } });
  }

  @Get('settings')
  async getSettings() {
    return {
      appName: 'HiGo Abuja',
      appVersion: '1.0.0',
      supportEmail: 'support@hiconnect.com',
      supportPhone: '+234 800 123 4567',
      currency: 'NGN',
      timezone: 'Africa/Lagos',
    };
  }
}
