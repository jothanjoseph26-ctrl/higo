import { Controller, Get, Post, Body } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get()
  liveness() {
    return { status: 'ok' };
  }

  @Public()
  @Get('ready')
  @HealthCheck()
  readiness() {
    return this.health.check([
      () => this.prismaIndicator.pingCheck('database', this.prisma),
      async () => {
        const pong = await this.redis.raw.ping();
        return {
          redis: { status: pong === 'PONG' ? 'up' : 'down' },
        };
      },
    ]);
  }

  @Public()
  @Post('debug-trips')
  async debugTrips() {
    const recentTrips = await (this.prisma as any).$queryRawUnsafe(`
      SELECT id, status, vehicle_type, payment_method, driver_id,
             created_at, cancelled_at, cancel_reason,
             ST_Y(pickup_location::geometry) AS pickup_lat,
             ST_X(pickup_location::geometry) AS pickup_lng
      FROM trips
      ORDER BY created_at DESC
      LIMIT 10
    `);

    const onlineDrivers = await (this.prisma as any).$queryRawUnsafe(`
      SELECT id, phone, name, is_online, kyc_status,
             current_location IS NOT NULL AS has_location
      FROM drivers
      WHERE is_online = true AND kyc_status = 'approved'
    `);

    const socketKeys = await this.redis.raw.keys('presence:driver:*');
    const dispatchKeys = await this.redis.raw.keys('dispatch:*');
    const offeredKeys = await this.redis.raw.keys('dispatch:offered_drivers:*');

    const presenceData: any[] = [];
    for (const key of socketKeys.slice(0, 10)) {
      const val = await this.redis.raw.get(key);
      const ttl = await this.redis.raw.ttl(key);
      presenceData.push({ key, value: val, ttlSeconds: ttl });
    }

    return {
      recentTrips: recentTrips.map((t: any) => ({
        id: t.id,
        status: t.status,
        vehicleType: t.vehicle_type,
        paymentMethod: t.payment_method,
        driverId: t.driver_id,
        createdAt: t.created_at,
        cancelledAt: t.cancelled_at,
        cancelReason: t.cancel_reason,
      })),
      onlineDrivers: onlineDrivers.map((d: any) => ({
        id: d.id,
        phone: d.phone,
        name: d.name,
        isOnline: d.is_online,
        kycStatus: d.kyc_status,
        hasLocation: d.has_location,
      })),
      redis: {
        presenceKeys: socketKeys.length,
        dispatchKeys: dispatchKeys.length,
        offeredKeys: offeredKeys.length,
        presenceData,
      },
    };
  }
}