import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { TripsModule } from '../trips/trips.module';
import { DriversController } from './drivers.controller';
import { HceModule } from '../hce/hce.module';
import { MatchingModule } from '../matching/matching.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    forwardRef(() => TripsModule),
    RealtimeModule,
    HceModule,
    forwardRef(() => MatchingModule),
  ],
  controllers: [DriversController],
})
export class DriversModule {}
