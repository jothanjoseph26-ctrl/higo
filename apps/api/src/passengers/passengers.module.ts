import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TripsModule } from '../trips/trips.module';
import { PassengersController } from './passengers.controller';
import { PassengersService } from './passengers.service';

@Module({
  imports: [PrismaModule, TripsModule],
  controllers: [PassengersController],
  providers: [PassengersService],
})
export class PassengersModule {}
