import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LatLng, Zone, ZoneType } from '@higo/shared-types';

@Injectable()
export class ZonesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getActiveZones(): Promise<Zone[]> {
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT 
        id, 
        name, 
        zone_type AS "zoneType", 
        ST_AsGeoJSON(boundary) AS "boundaryGeoJson", 
        surge_multiplier AS "surgeMultiplier", 
        is_active AS "isActive",
        created_at AS "createdAt"
      FROM zones
      WHERE is_active = true;
    `;

    return rows.map((row) => {
      const geojson = JSON.parse(row.boundaryGeoJson);
      const coords = geojson.coordinates[0] || [];
      const boundary: LatLng[] = coords.map((c: [number, number]) => ({
        lng: c[0],
        lat: c[1],
      }));

      return {
        id: row.id,
        name: row.name,
        zoneType: row.zoneType as ZoneType,
        boundary,
        surgeMultiplier: Number(row.surgeMultiplier),
        isActive: row.isActive,
        createdAt: row.createdAt.toISOString(),
      };
    });
  }

  async findRestrictedZone(point: LatLng): Promise<{ name: string } | null> {
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT name 
      FROM zones
      WHERE zone_type = 'restricted' 
        AND is_active = true
        AND ST_Contains(boundary::geometry, ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geometry)
      LIMIT 1;
    `;
    return rows.length > 0 ? { name: rows[0].name } : null;
  }

  async isInPermittedZone(point: LatLng): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT id 
      FROM zones
      WHERE zone_type = 'permitted' 
        AND is_active = true
        AND ST_Contains(boundary::geometry, ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geometry)
      LIMIT 1;
    `;
    return rows.length > 0;
  }
}
