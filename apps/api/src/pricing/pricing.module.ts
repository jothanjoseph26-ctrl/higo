import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MapsModule } from '../maps/maps.module';
import { PricingService } from './pricing.service';
import { SurgeRepository } from './surge.repository';

@Module({
  imports: [PrismaModule, MapsModule],
  providers: [SurgeRepository, PricingService],
  exports: [PricingService],
})
export class PricingModule {}
