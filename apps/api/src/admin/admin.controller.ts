import { Controller, Get, Post, Put, Delete, Body, Query, Param } from '@nestjs/common';
import {
  AdminGetWeeklyKpisHistoryResponse,
  AdminGetWeeklyKpisResponse,
} from '@higo/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { WeeklyKpiService } from '../jobs/weekly-kpi.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UseGuards } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception';

const PLATFORM_SETTINGS_ID = 'default';

const DEFAULT_PLATFORM_SETTINGS = {
  googleMapsOriginRestriction: 'https://admin.higo.ng/*',
  smsGatewayChannel: 'termii' as const,
  fcmServerKey: '',
  maintenanceMode: false,
};

type PlatformSettingsPayload = {
  googleMapsOriginRestriction: string;
  smsGatewayChannel: 'termii' | 'africastalking';
  fcmServerKey: string;
  maintenanceMode: boolean;
};

const FCM_KEY_MASK = '••••••••••••••••••••••••••••••••';

function parsePlatformSettings(raw: unknown): PlatformSettingsPayload {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Partial<PlatformSettingsPayload>;
  return {
    googleMapsOriginRestriction:
      typeof data.googleMapsOriginRestriction === 'string'
        ? data.googleMapsOriginRestriction
        : DEFAULT_PLATFORM_SETTINGS.googleMapsOriginRestriction,
    smsGatewayChannel:
      data.smsGatewayChannel === 'africastalking' ? 'africastalking' : 'termii',
    fcmServerKey: typeof data.fcmServerKey === 'string' ? data.fcmServerKey : '',
    maintenanceMode: Boolean(data.maintenanceMode),
  };
}

function maskFcmServerKey(settings: PlatformSettingsPayload): PlatformSettingsPayload {
  return {
    ...settings,
    fcmServerKey: settings.fcmServerKey ? FCM_KEY_MASK : '',
  };
}

const COMMISSION_RATE = 0.05;
const ACTIVE_TRIP_STATUSES = ['requested', 'matched', 'en_route', 'active'] as const;

function parseGeoPoint(geoJson: string | null | undefined): { lat: number; lng: number } | null {
  if (!geoJson) return null;
  const parsed = JSON.parse(geoJson);
  if (parsed.type === 'Point' && Array.isArray(parsed.coordinates)) {
    return { lng: parsed.coordinates[0], lat: parsed.coordinates[1] };
  }
  return null;
}

function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function mapZoneRow(row: any) {
  const geojson = JSON.parse(row.boundaryGeoJson);
  const coords = geojson.coordinates[0] || [];
  const boundary = coords.map((c: [number, number]) => ({
    lng: c[0],
    lat: c[1],
  }));

  return {
    id: row.id,
    name: row.name,
    zoneType: row.zoneType,
    boundary,
    surgeMultiplier: Number(row.surgeMultiplier),
    isActive: row.isActive,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  };
}

@Controller('admin')
@Roles('admin', 'super_admin')
@UseGuards(RolesGuard)
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly weeklyKpi: WeeklyKpiService,
  ) {}

  @Get('weekly-kpis')
  async getWeeklyKpis(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<AdminGetWeeklyKpisResponse> {
    if (from && to) {
      return this.weeklyKpi.computeForPeriod(new Date(from), new Date(to));
    }
    const range = this.weeklyKpi.getCurrentWeekRange();
    return this.weeklyKpi.computeForPeriod(range.from, range.to);
  }

  @Get('weekly-kpis/history')
  async getWeeklyKpisHistory(
    @Query('weeks') weeks?: string,
  ): Promise<AdminGetWeeklyKpisHistoryResponse> {
    const count = Math.min(Math.max(Number(weeks) || 12, 1), 52);
    const history = await this.weeklyKpi.computeHistory(count);
    return { weeks: history };
  }

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
      this.prisma.user.count(),
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

  @Get('dashboard/overview')
  async getDashboardOverview() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date(todayStart);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

    const [
      activeTrips,
      onlineDrivers,
      totalDriversApproved,
      totalPassengers,
      tripsToday,
      todayCompletedTrips,
      openDisputes,
      pendingKyc,
      trendTrips,
      zoneDistribution,
    ] = await Promise.all([
      this.prisma.trip.count({
        where: { status: { in: [...ACTIVE_TRIP_STATUSES] } },
      }),
      this.prisma.driver.count({ where: { isOnline: true } }),
      this.prisma.driver.count({ where: { kycStatus: 'approved' } }),
      this.prisma.user.count(),
      this.prisma.trip.count({ where: { createdAt: { gte: todayStart } } }),
      this.prisma.trip.findMany({
        where: { status: 'completed', completedAt: { gte: todayStart } },
        select: { totalFare: true },
      }),
      this.prisma.dispute.count({
        where: { status: { in: ['open', 'investigating'] } },
      }),
      this.prisma.driver.count({
        where: { kycStatus: { in: ['pending', 'under_review'] } },
      }),
      this.prisma.trip.findMany({
        where: {
          status: 'completed',
          createdAt: { gte: sevenDaysAgo },
        },
        select: { createdAt: true, totalFare: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.$queryRaw<any[]>`
        SELECT z.name AS "zoneName", COUNT(t.id)::int AS trips
        FROM zones z
        LEFT JOIN trips t
          ON t.status = 'completed'
          AND ST_Contains(z.boundary::geometry, t.pickup_location::geometry)
        WHERE z.is_active = true
        GROUP BY z.id, z.name
        ORDER BY trips DESC
        LIMIT 10;
      `.catch(() => []),
    ]);

    const grossRevenueToday = todayCompletedTrips.reduce((sum, trip) => sum + trip.totalFare, 0);
    const platformFeeToday = Math.round(grossRevenueToday * COMMISSION_RATE);

    const tripTrendMap = new Map<string, { trips: number; gross: number }>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(sevenDaysAgo);
      d.setDate(d.getDate() + i);
      tripTrendMap.set(formatDateKey(d), { trips: 0, gross: 0 });
    }

    for (const trip of trendTrips) {
      const key = formatDateKey(trip.createdAt);
      const entry = tripTrendMap.get(key);
      if (entry) {
        entry.trips += 1;
        entry.gross += trip.totalFare;
      }
    }

    const tripTrend = Array.from(tripTrendMap.entries()).map(([date, value]) => ({
      date,
      trips: value.trips,
    }));

    const earningsTrend = Array.from(tripTrendMap.entries()).map(([date, value]) => ({
      date,
      gross: value.gross,
      fee: Math.round(value.gross * COMMISSION_RATE),
    }));

    return {
      activeTrips,
      onlineDrivers,
      totalDriversApproved,
      totalPassengers,
      tripsToday,
      grossRevenueToday,
      platformFeeToday,
      openDisputes,
      pendingKyc,
      tripTrend,
      earningsTrend,
      zoneDistribution: zoneDistribution.map((row) => ({
        zoneName: row.zoneName,
        trips: Number(row.trips),
      })),
    };
  }

  @Get('trips/live')
  async getLiveTrips() {
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT
        t.id AS "tripId",
        t.status,
        t.driver_id AS "driverId",
        t.passenger_id AS "passengerId",
        t.started_at AS "startedAt",
        ST_AsGeoJSON(t.pickup_location) AS "pickupGeoJson",
        ST_AsGeoJSON(t.destination_location) AS "destGeoJson",
        ST_AsGeoJSON(d.current_location) AS "driverLocationGeoJson"
      FROM trips t
      LEFT JOIN drivers d ON d.id = t.driver_id
      WHERE t.status::text IN ('requested', 'matched', 'en_route', 'active');
    `;

    const trips = rows.map((row) => {
      const pickup = parseGeoPoint(row.pickupGeoJson);
      const destination = parseGeoPoint(row.destGeoJson);
      const driverLocation = parseGeoPoint(row.driverLocationGeoJson);

      return {
        tripId: row.tripId,
        status: row.status,
        driverId: row.driverId,
        driverLocation,
        pickup,
        destination,
        passengerId: row.passengerId,
        startedAt: row.startedAt ? row.startedAt.toISOString() : null,
      };
    }).filter((trip) => trip.pickup && trip.destination);

    return { trips };
  }

  @Get('drivers')
  async getDrivers(
    @Query('status') status?: string,
    @Query('kycStatus') kycStatus?: string,
    @Query('isOnline') isOnline?: string,
    @Query('isSuspended') isSuspended?: string,
    @Query('search') search?: string,
    @Query('limit') limit: number = 10,
    @Query('offset') offset: number = 0,
  ) {
    const where: any = {};
    if (status) where.isOnline = status === 'online';
    if (isOnline !== undefined && isOnline !== '') where.isOnline = isOnline === 'true';
    if (isSuspended !== undefined && isSuspended !== '') where.isSuspended = isSuspended === 'true';
    if (kycStatus) where.kycStatus = kycStatus;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { vehiclePlate: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [drivers, total] = await Promise.all([
      this.prisma.driver.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Number(limit),
        skip: Number(offset),
      }),
      this.prisma.driver.count({ where }),
    ]);

    return { drivers, total, limit: Number(limit), offset: Number(offset) };
  }

  @Put('drivers/:id/suspend')
  async suspendDriver(
    @Param('id') id: string,
    @Body() dto: { reason?: string },
  ) {
    const driver = await this.prisma.driver.update({
      where: { id },
      data: { isSuspended: true, isOnline: false },
    });
    return { driverId: driver.id, isSuspended: driver.isSuspended, reason: dto.reason ?? null };
  }

  @Put('drivers/:id/reinstate')
  async reinstateDriver(@Param('id') id: string) {
    const driver = await this.prisma.driver.update({
      where: { id },
      data: { isSuspended: false },
    });
    return { driverId: driver.id, isSuspended: driver.isSuspended };
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
    @Body() dto: { status: string; resolution?: string; refundAmount?: number },
  ) {
    return this.prisma.dispute.update({
      where: { id },
      data: {
        status: dto.status as any,
        resolution: dto.resolution,
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

  @Post('notifications/broadcast')
  async broadcastNotification(@Body() dto: {
    audience: 'all_passengers' | 'all_drivers' | 'online_drivers' | 'zone';
    zoneId?: string;
    title: string;
    body: string;
    type: string;
    data?: Record<string, unknown>;
  }) {
    let recipients: Array<{ userId: string; userType: 'passenger' | 'driver' }> = [];

    if (dto.audience === 'all_passengers') {
      const users = await this.prisma.user.findMany({ select: { id: true } });
      recipients = users.map((user) => ({ userId: user.id, userType: 'passenger' as const }));
    } else if (dto.audience === 'all_drivers') {
      const drivers = await this.prisma.driver.findMany({
        where: { userId: { not: null } },
        select: { userId: true },
      });
      recipients = drivers
        .filter((driver) => driver.userId)
        .map((driver) => ({ userId: driver.userId!, userType: 'driver' as const }));
    } else if (dto.audience === 'online_drivers') {
      const drivers = await this.prisma.driver.findMany({
        where: { isOnline: true, userId: { not: null } },
        select: { userId: true },
      });
      recipients = drivers
        .filter((driver) => driver.userId)
        .map((driver) => ({ userId: driver.userId!, userType: 'driver' as const }));
    } else if (dto.audience === 'zone' && dto.zoneId) {
      const drivers = await this.prisma.driver.findMany({
        where: { operatingZoneIds: { has: dto.zoneId }, userId: { not: null } },
        select: { userId: true },
      });
      recipients = drivers
        .filter((driver) => driver.userId)
        .map((driver) => ({ userId: driver.userId!, userType: 'driver' as const }));
    }

    const batch = recipients.slice(0, 500);
    await this.prisma.notification.createMany({
      data: batch.map((recipient) => ({
        userId: recipient.userId,
        userType: recipient.userType,
        title: dto.title,
        body: dto.body,
        type: dto.type,
        data: dto.data,
        sentAt: new Date(),
      })),
    });

    return { recipients: recipients.length, queued: true };
  }

  @Get('zones')
  async getZones(@Query('type') type?: string) {
    const rows = type
      ? await this.prisma.$queryRaw<any[]>`
          SELECT
            id,
            name,
            zone_type AS "zoneType",
            ST_AsGeoJSON(boundary) AS "boundaryGeoJson",
            surge_multiplier AS "surgeMultiplier",
            is_active AS "isActive",
            created_at AS "createdAt"
          FROM zones
          WHERE zone_type::text = ${type}
          ORDER BY name ASC;
        `
      : await this.prisma.$queryRaw<any[]>`
          SELECT
            id,
            name,
            zone_type AS "zoneType",
            ST_AsGeoJSON(boundary) AS "boundaryGeoJson",
            surge_multiplier AS "surgeMultiplier",
            is_active AS "isActive",
            created_at AS "createdAt"
          FROM zones
          ORDER BY name ASC;
        `;

    return rows.map(mapZoneRow);
  }

  @Post('zones')
  async createZone(@Body() dto: {
    name: string;
    zoneType: string;
    boundary: Array<{ lat: number; lng: number }>;
    surgeMultiplier?: number;
  }) {
    if (!dto.boundary || dto.boundary.length < 3) {
      throw new AppException('VALIDATION_ERROR', undefined, 'Zone boundary requires at least 3 points');
    }

    const ring = [...dto.boundary];
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first.lat !== last.lat || first.lng !== last.lng) {
      ring.push(first);
    }

    const pointLiterals = ring.map((point) => `ST_MakePoint(${point.lng}, ${point.lat})`).join(', ');

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO zones (id, name, zone_type, boundary, surge_multiplier, is_active, created_at)
       VALUES (
         gen_random_uuid(),
         $1,
         $2::"ZoneType",
         ST_SetSRID(ST_MakePolygon(ST_MakeLine(ARRAY[${pointLiterals}])), 4326)::geography,
         $3,
         true,
         NOW()
       )
       RETURNING
         id,
         name,
         zone_type AS "zoneType",
         ST_AsGeoJSON(boundary) AS "boundaryGeoJson",
         surge_multiplier AS "surgeMultiplier",
         is_active AS "isActive",
         created_at AS "createdAt"`,
      dto.name,
      dto.zoneType,
      dto.surgeMultiplier ?? 1.0,
    );

    return mapZoneRow(rows[0]);
  }

  @Delete('zones/:id')
  async deleteZone(@Param('id') id: string) {
    await this.prisma.$executeRaw`DELETE FROM zones WHERE id = ${id}::uuid`;
    return { deleted: true, zoneId: id };
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

  @Put('pricing')
  async upsertPricing(@Body() dto: {
    vehicleType: string;
    baseFare: number;
    perKmFare: number;
    perMinFare: number;
    minFare: number;
  }) {
    const existing = await this.prisma.pricingConfig.findFirst({
      where: { vehicleType: dto.vehicleType as any, isActive: true },
    });

    if (existing) {
      return this.prisma.pricingConfig.update({
        where: { id: existing.id },
        data: {
          baseFare: dto.baseFare,
          perKmFare: dto.perKmFare,
          perMinFare: dto.perMinFare,
          minFare: dto.minFare,
        },
      });
    }

    return this.prisma.pricingConfig.create({
      data: {
        vehicleType: dto.vehicleType as any,
        baseFare: dto.baseFare,
        perKmFare: dto.perKmFare,
        perMinFare: dto.perMinFare,
        minFare: dto.minFare,
      },
    });
  }

  @Put('pricing/:id')
  async updatePricing(@Param('id') id: string, @Body() dto: any) {
    return this.prisma.pricingConfig.update({ where: { id }, data: dto });
  }

  @Get('users')
  async getUsers(
    @Query('search') search?: string,
    @Query('isBlocked') isBlocked?: string,
    @Query('limit') limit: number = 10,
    @Query('offset') offset: number = 0,
  ) {
    const where: any = {};
    if (isBlocked !== undefined && isBlocked !== '') {
      where.isBlocked = isBlocked === 'true';
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Number(limit),
        skip: Number(offset),
        select: {
          id: true, name: true, email: true, phone: true,
          isBlocked: true, totalTrips: true, ratingAvg: true, createdAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users, total, limit: Number(limit), offset: Number(offset) };
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
    const row = await this.prisma.platformSettings.findUnique({
      where: { id: PLATFORM_SETTINGS_ID },
    });

    const settings = parsePlatformSettings(row?.settings ?? DEFAULT_PLATFORM_SETTINGS);
    return maskFcmServerKey(settings);
  }

  @Put('settings')
  @Roles('super_admin')
  async updateSettings(@Body() dto: Partial<PlatformSettingsPayload>) {
    const existingRow = await this.prisma.platformSettings.findUnique({
      where: { id: PLATFORM_SETTINGS_ID },
    });
    const current = parsePlatformSettings(existingRow?.settings ?? DEFAULT_PLATFORM_SETTINGS);

    const incomingFcmKey = dto.fcmServerKey;
    const shouldKeepExistingFcmKey =
      incomingFcmKey === undefined ||
      incomingFcmKey === '' ||
      incomingFcmKey === FCM_KEY_MASK;

    const next: PlatformSettingsPayload = {
      googleMapsOriginRestriction:
        typeof dto.googleMapsOriginRestriction === 'string'
          ? dto.googleMapsOriginRestriction
          : current.googleMapsOriginRestriction,
      smsGatewayChannel:
        dto.smsGatewayChannel === 'africastalking' || dto.smsGatewayChannel === 'termii'
          ? dto.smsGatewayChannel
          : current.smsGatewayChannel,
      fcmServerKey: shouldKeepExistingFcmKey ? current.fcmServerKey : incomingFcmKey!,
      maintenanceMode:
        typeof dto.maintenanceMode === 'boolean' ? dto.maintenanceMode : current.maintenanceMode,
    };

    const row = await this.prisma.platformSettings.upsert({
      where: { id: PLATFORM_SETTINGS_ID },
      create: { id: PLATFORM_SETTINGS_ID, settings: next },
      update: { settings: next },
    });

    return maskFcmServerKey(parsePlatformSettings(row.settings));
  }
}
