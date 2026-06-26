import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LatLng, VehicleType } from '@higo/shared-types';

@Injectable()
export class GeoRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findNearestOnlineDrivers(
    point: LatLng,
    vehicleType: VehicleType,
    maxRadiusMeters = 5000,
  ): Promise<Array<{ id: string; distanceMeters: number }>> {
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT 
        id,
        ST_Distance(
          current_location, 
          ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography
        ) AS dist
      FROM drivers
      WHERE is_online = true
        AND kyc_status = 'approved'
        AND is_suspended = false
        AND vehicle_type::text = ${vehicleType}::text
        AND ST_DWithin(
          current_location, 
          ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography, 
          ${maxRadiusMeters}
        )
      ORDER BY dist ASC
      LIMIT 10;
    `;

    return rows.map((row) => ({
      id: row.id,
      distanceMeters: Number(row.dist),
    }));
  }

  async updateDriverLocation(driverId: string, point: LatLng): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE drivers
      SET current_location = ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography,
          updated_at = NOW()
      WHERE id = ${driverId}::uuid;
    `;
  }

  async findNearbyOnlineDrivers(
    point: LatLng,
    maxRadiusMeters = 5000,
    limit = 50,
  ): Promise<Array<{ id: string; lat: number; lng: number; distanceMeters: number }>> {
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT
        id,
        ST_Y(current_location::geometry) AS lat,
        ST_X(current_location::geometry) AS lng,
        ST_Distance(
          current_location,
          ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography
        ) AS dist
      FROM drivers
      WHERE is_online = true
        AND kyc_status = 'approved'
        AND is_suspended = false
        AND current_location IS NOT NULL
        AND ST_DWithin(
          current_location,
          ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography,
          ${maxRadiusMeters}
        )
      ORDER BY dist ASC
      LIMIT ${limit};
    `;

    return rows.map((row) => ({
      id: row.id,
      lat: Number(row.lat),
      lng: Number(row.lng),
      distanceMeters: Number(row.dist),
    }));
  }

  async insertDriverLocationHistory(
    driverId: string,
    point: LatLng,
    bearing = 0,
    speed = 0,
  ): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO driver_locations (id, driver_id, location, bearing, speed, recorded_at)
      VALUES (
        gen_random_uuid(),
        ${driverId}::uuid, 
        ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography, 
        ${bearing}, 
        ${speed}, 
        NOW()
      );
    `;
  }
}
