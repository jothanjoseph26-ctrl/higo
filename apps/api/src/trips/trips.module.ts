import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ZonesModule } from '../zones/zones.module';
import { PricingModule } from '../pricing/pricing.module';
import { MatchingModule } from '../matching/matching.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { PaymentsModule } from '../payments/payments.module';
import { RedisModule } from '../redis/redis.module';
import { PushModule } from '../push/push.module';
import { PromosModule } from '../promos/promos.module';
import { TripService } from './trips.service';
import { TripsController } from './trips.controller';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    PushModule,
    PromosModule,
    ZonesModule,
    PricingModule,
    forwardRef(() => MatchingModule),
    forwardRef(() => RealtimeModule),
    PaymentsModule,
  ],
  providers: [TripService],
  controllers: [TripsController],
  exports: [TripService],
})
export class TripsModule {}
