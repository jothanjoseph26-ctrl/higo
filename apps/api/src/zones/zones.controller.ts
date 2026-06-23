import { Controller, Get } from '@nestjs/common';
import { ZonesService } from './zones.service';
import { Zone } from '@higo/shared-types';
import { Public } from '../common/decorators/public.decorator';

@Controller('zones')
export class ZonesController {
  constructor(private readonly zonesService: ZonesService) {}

  @Public()
  @Get()
  async getZones(): Promise<Zone[]> {
    return this.zonesService.getActiveZones();
  }
}
