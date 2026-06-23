import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PricingService } from './pricing.service';
import { SurgeRepository } from './surge.repository';

@Module({
  imports: [PrismaModule],
  providers: [SurgeRepository, PricingService],
  exports: [PricingService],
})
export class PricingModule {}
