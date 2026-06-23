import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ZonesRepository } from './zones.repository';
import { ZonesService } from './zones.service';
import { ZonesController } from './zones.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ZonesController],
  providers: [ZonesRepository, ZonesService],
  exports: [ZonesService],
})
export class ZonesModule {}
