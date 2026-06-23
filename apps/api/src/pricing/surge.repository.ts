import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LatLng } from '@higo/shared-types';

@Injectable()
export class SurgeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getSurgeMultiplier(point: LatLng): Promise<number> {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
    const timeStr = now.toTimeString().split(' ')[0]; // 'HH:MM:SS'

    // 1. Get multiplier from surge_rules
    const ruleRows = await this.prisma.$queryRaw<any[]>`
      SELECT sr.multiplier
      FROM surge_rules sr
      JOIN zones z ON z.id = sr.zone_id
      WHERE sr.is_active = true
        AND z.is_active = true
        AND ST_Contains(z.boundary::geometry, ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geometry)
        AND sr.day_of_week = ${dayOfWeek}
        AND sr.start_time <= ${timeStr}
        AND sr.end_time   >= ${timeStr}
      ORDER BY sr.multiplier DESC
      LIMIT 1;
    `;

    // 2. Get multiplier from surge-type zones
    const zoneRows = await this.prisma.$queryRaw<any[]>`
      SELECT surge_multiplier AS "surgeMultiplier"
      FROM zones
      WHERE zone_type = 'surge'
        AND is_active = true
        AND ST_Contains(boundary::geometry, ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geometry)
      ORDER BY surge_multiplier DESC
      LIMIT 1;
    `;

    let maxMultiplier = 1.0;

    if (ruleRows.length > 0) {
      maxMultiplier = Math.max(maxMultiplier, Number(ruleRows[0].multiplier));
    }

    if (zoneRows.length > 0) {
      maxMultiplier = Math.max(maxMultiplier, Number(zoneRows[0].surgeMultiplier));
    }

    return maxMultiplier;
  }
}
