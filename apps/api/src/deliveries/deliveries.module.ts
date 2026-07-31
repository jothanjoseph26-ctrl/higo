import { Module } from '@nestjs/common';
import { MatchingModule } from '../matching/matching.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DeliveriesController } from './deliveries.controller';
import { DeliveriesService } from './deliveries.service';

@Module({
  imports: [PrismaModule, MatchingModule],
  controllers: [DeliveriesController],
  providers: [DeliveriesService],
  exports: [DeliveriesService],
})
export class DeliveriesModule {}
