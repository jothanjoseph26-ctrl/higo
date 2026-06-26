import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { TripsModule } from '../trips/trips.module';
import { PaymentsModule } from '../payments/payments.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { AdminController } from './admin.controller';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    forwardRef(() => TripsModule),
    PaymentsModule,
    RealtimeModule,
    JobsModule,
  ],
  controllers: [AdminController],
})
export class AdminModule {}