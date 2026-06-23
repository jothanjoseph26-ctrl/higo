import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ZonesModule } from '../zones/zones.module';
import { PricingModule } from '../pricing/pricing.module';
import { MatchingModule } from '../matching/matching.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { PaymentsModule } from '../payments/payments.module';
import { RedisModule } from '../redis/redis.module';
import { TripService } from './trips.service';
import { TripsController } from './trips.controller';
import { DriversController } from './drivers.controller';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    ZonesModule,
    PricingModule,
    forwardRef(() => MatchingModule),
    forwardRef(() => RealtimeModule),
    PaymentsModule,
  ],
  providers: [TripService],
  controllers: [TripsController, DriversController],
  exports: [TripService],
})
export class TripsModule {}
