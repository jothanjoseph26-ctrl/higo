import { Controller, Get, Post, Put, Delete, Body, Query, Param, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { GetDriversResponse, CreateDriverRequest, UpdateDriverRequest, DriverProfileResponse, GetDriverKycResponse, GetDriverDisputesResponse, GetDriverNotificationsResponse, GetAdminFinancialReportResponse, GetAdminDashboardStatsResponse, GetAdminZoneManagementResponse, GetAdminPricingResponse, GetAdminUserManagementResponse, GetAdminSettingsResponse } from '@higo/shared-types';

@Controller('admin')
@Roles('admin', 'super_admin')
@UseGuards(RolesGuard)
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('dashboard/stats')
  async getDashboardStats(): Promise<GetAdminDashboardStatsResponse> {
    const [
      totalDrivers,
      totalPassengers,
      activeTrips,
      completedTrips,
      pendingKyc,
      totalRevenue,
      activeSubscriptions,
    ] = await Promise.all([
      this.prisma.driver.count(),
      this.prisma.user.count({ where: { type: 'passenger' } }),
      this.prisma.trip.count({ where: { status: { in: ['requested', 'matched', 'en_route', 'active'] } } }),
      this.prisma.trip.count({ where: { status: 'completed' } }),
      this.prisma.driver.count({ where: { kycStatus: 'pending' } }),
      this.prisma.earnings.aggregate({
        where: { status: 'paid' },
        _sum: { amount: true },
      }),
      this.prisma.subscription.count({ where: { status: 'active' } }),
    ]);

    return {
      totalDrivers,
      totalPassengers,
      activeTrips,
      completedTrips,
      pendingKyc,
      totalRevenue: totalRevenue._sum.amount || 0,
      activeSubscriptions,
    };
  }

  @Get('drivers')
  async getDrivers(
    @Query('status') status?: string,
    @Query('kycStatus') kycStatus?: string,
    @Query('limit') limit: number = 10,
    @Query('offset') offset: number = 0,
  ): Promise<GetDriversResponse> {
    const where: any = {};

    if (status) {
      where.isOnline = status === 'online';
    }

    if (kycStatus) {
      where.kycStatus = kycStatus;
    }

    const [drivers, total] = await Promise.all([
      this.prisma.driver.findMany({
        where,
        include: {
          user: true,
          vehicle: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.driver.count({ where }),
    ]);

    return {
      drivers: drivers.map(driver => ({
        id: driver.id,
        userId: driver.userId,
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
        vehicle: driver.vehicle,
      })),
      total,
      limit,
      offset,
    };
  }

  @Get('drivers/:id')
  async getDriver(@Param('id') id: string): Promise<DriverProfileResponse> {
    const driver = await this.prisma.driver.findUnique({
      where: { id },
      include: {
        user: true,
        vehicle: true,
        subscription: true,
        kycDocuments: true,
      },
    });

    if (!driver) {
      throw new AppException('NOT_FOUND', undefined, 'Driver not found');
    }

    return {
      id: driver.id,
      userId: driver.userId,
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
      vehicle: driver.vehicle,
      subscription: driver.subscription,
      kycDocuments: driver.kycDocuments,
    };
  }

  @Put('drivers/:id')
  async updateDriver(
    @Param('id') id: string,
    @Body() dto: UpdateDriverRequest,
  ): Promise<DriverProfileResponse> {
    const driver = await this.prisma.driver.update({
      where: { id },
      data: {
        licenseNumber: dto.licenseNumber,
        vehiclePlate: dto.vehiclePlate,
        vehicleModel: dto.vehicleModel,
        vehicleColor: dto.vehicleColor,
        kycStatus: dto.kycStatus,
        isSuspended: dto.isSuspended,
        rating: dto.rating,
        totalTrips: dto.totalTrips,
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
      vehicle: driver.vehicle,
      subscription: driver.subscription,
      kycDocuments: driver.kycDocuments,
    };
  }

  @Delete('drivers/:id')
  async deleteDriver(@Param('id') id: string) {
    await this.prisma.driver.delete({ where: { id } });
    return { success: true };
  }

  @Post('drivers')
  async createDriver(@Body() dto: CreateDriverRequest): Promise<DriverProfileResponse> {
    const driver = await this.prisma.driver.create({
      data: {
        id: dto.id,
        userId: dto.userId,
        licenseNumber: dto.licenseNumber,
        vehiclePlate: dto.vehiclePlate,
        vehicleModel: dto.vehicleModel,
        vehicleColor: dto.vehicleColor,
        kycStatus: dto.kycStatus,
        isOnline: dto.isOnline,
        subscriptionTier: dto.subscriptionTier,
        subscriptionExpiresAt: dto.subscriptionExpiresAt,
        isSuspended: dto.isSuspended,
        rating: dto.rating,
        totalTrips: dto.totalTrips,
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
      vehicle: driver.vehicle,
      subscription: driver.subscription,
      kycDocuments: driver.kycDocuments,
    };
  }

  @Get('kyc')
  async getDriverKyc(
    @Query('status') status?: string,
    @Query('limit') limit: number = 10,
    @Query('offset') offset: number = 0,
  ): Promise<GetDriverKycResponse> {
    const where: any = {};

    if (status) {
      where.kycStatus = status;
    }

    const [kycDocuments, total] = await Promise.all([
      this.prisma.kycDocument.findMany({
        where,
        include: {
          driver: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.kycDocument.count({ where }),
    ]);

    return {
      kycDocuments: kycDocuments.map(doc => ({
        id: doc.id,
        driverId: doc.driverId,
        docType: doc.docType,
        fileUrl: doc.fileUrl,
        status: doc.status,
        rejectionReason: doc.rejectionReason,
        rejectionCode: doc.rejectionCode,
        uploadedAt: doc.uploadedAt,
        reviewedAt: doc.reviewedAt,
        driver: doc.driver,
      })),
      total,
      limit,
      offset,
    };
  }

  @Put('kyc/:id')
  async updateKycDocument(
    @Param('id') id: string,
    @Body() dto: { status: string; rejectionReason?: string; rejectionCode?: string },
  ): Promise<DriverProfileResponse> {
    const kycDocument = await this.prisma.kycDocument.update({
      where: { id },
      data: {
        status: dto.status,
        rejectionReason: dto.rejectionReason,
        rejectionCode: dto.rejectionCode,
        reviewedAt: new Date(),
      },
      include: {
        driver: {
          include: {
            user: true,
            vehicle: true,
            subscription: true,
            kycDocuments: true,
          },
        },
      },
    });

    return {
      id: kycDocument.driver.id,
      userId: kycDocument.driver.userId,
      licenseNumber: kycDocument.driver.licenseNumber,
      vehiclePlate: kycDocument.driver.vehiclePlate,
      vehicleModel: kycDocument.driver.vehicleModel,
      vehicleColor: kycDocument.driver.vehicleColor,
      kycStatus: kycDocument.driver.kycStatus,
      isOnline: kycDocument.driver.isOnline,
      subscriptionTier: kycDocument.driver.subscriptionTier,
      subscriptionExpiresAt: kycDocument.driver.subscriptionExpiresAt,
      isSuspended: kycDocument.driver.isSuspended,
      rating: kycDocument.driver.rating,
      totalTrips: kycDocument.driver.totalTrips,
      createdAt: kycDocument.driver.createdAt,
      user: kycDocument.driver.user,
      vehicle: kycDocument.driver.vehicle,
      subscription: kycDocument.driver.subscription,
      kycDocuments: kycDocument.driver.kycDocuments,
    };
  }

  @Get('disputes')
  async getDriverDisputes(
    @Query('status') status?: string,
    @Query('limit') limit: number = 10,
    @Query('offset') offset: number = 0,
  ): Promise<GetDriverDisputesResponse> {
    const where: any = {};

    if (status) {
      where.status = status;
    }

    const [disputes, total] = await Promise.all([
      this.prisma.dispute.findMany({
        where,
        include: {
          driver: true,
          passenger: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.dispute.count({ where }),
    ]);

    return {
      disputes: disputes.map(dispute => ({
        id: dispute.id,
        driverId: dispute.driverId,
        passengerId: dispute.passengerId,
        tripId: dispute.tripId,
        status: dispute.status,
        raisedBy: dispute.raisedBy,
        description: dispute.description,
        resolution: dispute.resolution,
        createdAt: dispute.createdAt,
        resolvedAt: dispute.resolvedAt,
        driver: dispute.driver,
        passenger: dispute.passenger,
      })),
      total,
      limit,
      offset,
    };
  }

  @Get('notifications')
  async getDriverNotifications(
    @Query('limit') limit: number = 10,
    @Query('offset') offset: number = 0,
  ): Promise<GetDriverNotificationsResponse> {
    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: { type: 'driver' }),
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.notification.count({ where: { type: 'driver' } }),
    ]);

    return {
      notifications: notifications.map(notification => ({
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        data: notification.data,
        isRead: notification.isRead,
        createdAt: notification.createdAt,
      })),
      total,
      limit,
      offset,
    };
  }

  @Get('financial/report')
  async getFinancialReport(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('period') period: 'daily' | 'weekly' | 'monthly' = 'daily',
  ): Promise<GetAdminFinancialReportResponse> {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const [earnings, expenses, transactions] = await Promise.all([
      this.prisma.earnings.findMany({
        where: {
          createdAt: { gte: start, lte: end },
          status: 'paid',
        },
      }),
      this.prisma.expenses.findMany({
        where: {
          createdAt: { gte: start, lte: end },
          status: 'approved',
        },
      }),
      this.prisma.transaction.findMany({
        where: {
          createdAt: { gte: start, lte: end },
          status: 'completed',
        },
      }),
    ]);

    const totalRevenue = earnings.reduce((sum, e) => sum + e.amount, 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const netProfit = totalRevenue - totalExpenses;

    return {
      totalRevenue,
      totalExpenses,
      netProfit,
      period,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      earningsCount: earnings.length,
      expensesCount: expenses.length,
      transactionsCount: transactions.length,
    };
  }

  @Get('zones')
  async getZoneManagement(
    @Query('type') type?: string,
    @Query('limit') limit: number = 10,
    @Query('offset') offset: number = 0,
  ): Promise<GetAdminZoneManagementResponse> {
    const where: any = {};

    if (type) {
      where.type = type;
    }

    const [zones, total] = await Promise.all([
      this.prisma.zone.findMany({
        where,
        orderBy: { name: 'asc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.zone.count({ where }),
    ]);

    return {
      zones: zones.map(zone => ({
        id: zone.id,
        name: zone.name,
        type: zone.type,
        geometry: zone.geometry,
        description: zone.description,
        isActive: zone.isActive,
        createdAt: zone.createdAt,
        updatedAt: zone.updatedAt,
      })),
      total,
      limit,
      offset,
    };
  }

  @Put('zones/:id')
  async updateZone(
    @Param('id') id: string,
    @Body() dto: any,
  ): Promise<any> {
    return this.prisma.zone.update({
      where: { id },
      data: dto,
    });
  }

  @Get('pricing')
  async getPricing(
    @Query('vehicleType') vehicleType?: string,
    @Query('limit') limit: number = 10,
    @Query('offset') offset: number = 0,
  ): Promise<GetAdminPricingResponse> {
    const where: any = {};

    if (vehicleType) {
      where.vehicleType = vehicleType;
    }

    const [pricing, total] = await Promise.all([
      this.prisma.pricing.findMany({
        where,
        orderBy: { vehicleType: 'asc' }},
        take: limit,
        skip: offset,
      )),
      this.prisma.pricing.count({ where }),
    ]);

    return {
      pricing: pricing.map(item => ({
        id: item.id,
        vehicleType: item.vehicleType,
        baseFare: item.baseFare,
        perKmRate: item.perKmRate,
        perMinRate: item.perMinRate,
        surgeMultiplier: item.surgeMultiplier,
        minimumFare: item.minimumFare,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
      total,
      limit,
      offset,
    };
  }

  @Put('pricing/:id')
  async updatePricing(
    @Param('id') id: string,
    @Body() dto: any,
  ): Promise<any> {
    return this.prisma.pricing.update({
      where: { id },
      data: dto,
    });
  }

  @Get('users')
  async getUserManagement(
    @Query('type') type?: string,
    @Query('limit') limit: number = 10,
    @Query('offset') offset: number = 0,
  ): Promise<GetAdminUserManagementResponse> {
    const where: any = {};

    if (type) {
      where.type = type;
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          type: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      users,
      total,
      limit,
      offset,
    };
  }

  @Put('users/:id')
  async updateUser(
    @Param('id') id: string,
    @Body() dto: any,
  ): Promise<any> {
    return this.prisma.user.update({
      where: { id },
      data: dto,
    });
  }

  @Get('settings')
  async getSettings(): Promise<GetAdminSettingsResponse> {
    return {
      appName: 'HiGo Abuja',
      appVersion: '1.0.0',
      supportEmail: 'support@hiconnect.com',
      supportPhone: '+234 800 123 4567',
      termsUrl: 'https://hiconnect.com/terms',
      privacyUrl: 'https://hiconnect.com/privacy',
      currency: 'NGN',
      timezone: 'Africa/Lagos',
      language: 'en',
      features: {
        rideHailing: true,
        driverOnboarding: true,
        passengerManagement: true,
        adminDashboard: true,
        financialReports: true,
        zoneManagement: true,
        pricingConfiguration: true,
        userManagement: true,
        notifications: true,
        disputes: true,
      },
    };
  }
}