import { Injectable } from '@nestjs/common';
import { ZonesRepository } from './zones.repository';
import { LatLng, Zone } from '@higo/shared-types';

@Injectable()
export class ZonesService {
  constructor(private readonly zonesRepo: ZonesRepository) {}

  async getActiveZones(): Promise<Zone[]> {
    return this.zonesRepo.getActiveZones();
  }

  async isPointRestricted(point: LatLng): Promise<{ restricted: boolean; zoneName?: string }> {
    const zone = await this.zonesRepo.findRestrictedZone(point);
    if (zone) {
      return { restricted: true, zoneName: zone.name };
    }
    return { restricted: false };
  }

  async isPointInPermittedZone(point: LatLng): Promise<boolean> {
    return this.zonesRepo.isInPermittedZone(point);
  }
}
