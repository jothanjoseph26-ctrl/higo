import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { GeoRepository } from '../matching/geo.repository';
import { LatLng } from '@higo/shared-types';

@Injectable()
export class PresenceService {
  constructor(
    private readonly redis: RedisService,
    private readonly geoRepo: GeoRepository,
  ) {}

  async setDriverOnline(driverId: string, lat: number, lng: number): Promise<void> {
    const presenceKey = `presence:driver:${driverId}`;
    const locationKey = `loc:driver:${driverId}`;

    // Set online presence status in Redis with a 60s TTL (refreshed on each location update)
    await this.redis.set(presenceKey, 'online', 60);

    const locationData = {
      lat,
      lng,
      bearing: 0,
      speed: 0,
      ts: Date.now(),
    };
    await this.redis.set(locationKey, JSON.stringify(locationData));

    // Persist immediately when going online
    await this.geoRepo.updateDriverLocation(driverId, { lat, lng });
    await this.geoRepo.insertDriverLocationHistory(driverId, { lat, lng }, 0, 0);
  }

  async setDriverOffline(driverId: string): Promise<void> {
    await this.redis.del(`presence:driver:${driverId}`);
    await this.redis.del(`loc:driver:${driverId}`);
    await this.redis.del(`loc:driver:last_persist:${driverId}`);
  }

  async updateDriverLocation(
    driverId: string,
    lat: number,
    lng: number,
    bearing?: number,
    speed?: number,
  ): Promise<void> {
    const presenceKey = `presence:driver:${driverId}`;
    const locationKey = `loc:driver:${driverId}`;

    // Refresh presence TTL
    await this.redis.set(presenceKey, 'online', 60);

    const locationData = {
      lat,
      lng,
      bearing: bearing ?? 0,
      speed: speed ?? 0,
      ts: Date.now(),
    };
    await this.redis.set(locationKey, JSON.stringify(locationData));

    // Throttled persist to PostGIS (at most ~1/sec per driver)
    const lockKey = `loc:driver:last_persist:${driverId}`;
    const acquiredLock = await this.redis.setNx(lockKey, '1', 1);

    if (acquiredLock) {
      // Lock acquired successfully -> it's been at least 1 second, so persist to PostGIS
      await this.geoRepo.updateDriverLocation(driverId, { lat, lng });
      await this.geoRepo.insertDriverLocationHistory(
        driverId,
        { lat, lng },
        bearing ?? 0,
        speed ?? 0,
      );
    }
  }

  async getDriverLocation(driverId: string): Promise<{
    lat: number;
    lng: number;
    bearing: number;
    speed: number;
    ts: number;
  } | null> {
    const data = await this.redis.get(`loc:driver:${driverId}`);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  async isDriverOnline(driverId: string): Promise<boolean> {
    const val = await this.redis.get(`presence:driver:${driverId}`);
    return val === 'online';
  }
}
