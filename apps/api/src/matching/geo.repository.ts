import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformSettingsReader } from '../admin/platform-settings-reader.service';
import { LatLng, VehicleType } from '@higo/shared-types';

@Injectable()
export class GeoRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PlatformSettingsReader,
  ) {}

  /**
   * P0: Find nearest online drivers filtered by city.
   *
   * CITY FILTER LOGIC:
   * - If `city` is provided and non-empty: only return drivers whose `city` matches
   *   OR drivers with NULL/empty city (unclassified drivers are EXCLUDED from
   *   city-restricted matching — they are marked LOCATION_UNCLASSIFIED).
   * - If `city` is null/undefined/empty: fall back to proximity-only search
   *   (no city filter). This preserves backward compatibility for flows that
   *   don't yet provide city.
   *
   * WHY CITY ALONE (NOT STATE+ZONE):
   * - The `state` field is often NULL or defaulted to 'FCT' for all drivers.
   * - `operatingZoneIds` is stored but never enforced in matching.
   * - City is the only reliably populated location field on existing drivers.
   * - P1/P2/P3 will add state and zone validation.
   *
   * WHAT HAPPENS TO NULL-CITY DRIVERS:
   * - They are EXCLUDED when a city filter is active.
   * - They are NOT incorrectly assigned to any city.
   * - They will NOT receive ride requests until their city is established.
   * - This is intentional: it is safer to exclude than to misclassify.
   */
  async findNearestOnlineDrivers(
    point: LatLng,
    vehicleType: VehicleType,
    maxRadiusMeters?: number,
    city?: string,
  ): Promise<Array<{ id: string; distanceMeters: number }>> {
    const radius = maxRadiusMeters ?? (await this.settings.getMatchSettings()).radiusMeters;

    // P0: If city is provided, filter by city. Drivers with NULL city are excluded.
    // If city is not provided, fall back to proximity-only (backward compatible).
    if (city && city.trim()) {
      const normalizedCity = city.trim();
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
          AND current_location IS NOT NULL
          AND vehicle_type = ${vehicleType}::"VehicleType"
          AND LOWER(city) = LOWER(${normalizedCity})
          AND ST_DWithin(
            current_location,
            ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography,
            ${radius}
          )
        ORDER BY dist ASC
        LIMIT 10;
      `;

      return rows.map((row) => ({
        id: row.id,
        distanceMeters: Number(row.dist),
      }));
    }

    // No city filter: proximity-only search (original behavior)
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
        AND current_location IS NOT NULL
        AND vehicle_type = ${vehicleType}::"VehicleType"
        AND ST_DWithin(
          current_location,
          ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography,
          ${radius}
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
    maxRadiusMeters?: number,
    limit = 50,
  ): Promise<Array<{ id: string; lat: number; lng: number; distanceMeters: number }>> {
    const radius = maxRadiusMeters ?? (await this.settings.getMatchSettings()).radiusMeters;
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
          ${radius}
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
