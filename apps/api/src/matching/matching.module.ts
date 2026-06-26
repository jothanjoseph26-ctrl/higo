import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { TripsModule } from '../trips/trips.module';
import { MatchingService } from './matching.service';
import { CtsService } from './cts.service';
import { GeoRepository } from './geo.repository';
import { PushModule } from '../push/push.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    PushModule,
    forwardRef(() => TripsModule),
    forwardRef(() => RealtimeModule),
    BullModule.registerQueue({
      name: 'dispatch',
    }),
  ],
  providers: [GeoRepository, CtsService, MatchingService],
  exports: [MatchingService, GeoRepository],
})
export class MatchingModule {}
