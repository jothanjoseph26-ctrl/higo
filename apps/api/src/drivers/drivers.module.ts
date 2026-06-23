import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { TripsModule } from '../trips/trips.module';
import { DriversController } from './drivers.controller';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => TripsModule),
    RealtimeModule,
  ],
  controllers: [DriversController],
})
export class DriversModule {}