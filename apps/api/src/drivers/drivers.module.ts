import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { TripsModule } from '../trips/trips.module';
import { DriversController } from './drivers.controller';
import { HceModule } from '../hce/hce.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => TripsModule),
    RealtimeModule,
    HceModule,
  ],
  controllers: [DriversController],
})
export class DriversModule {}
