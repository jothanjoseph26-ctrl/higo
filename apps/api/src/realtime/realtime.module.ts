import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { TripsModule } from '../trips/trips.module';
import { MatchingModule } from '../matching/matching.module';
import { EventsGateway } from './events.gateway';
import { PresenceService } from './presence.service';
import { RoomService } from './room.service';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    RedisModule,
    forwardRef(() => TripsModule),
    forwardRef(() => MatchingModule),
  ],
  providers: [PresenceService, RoomService, EventsGateway],
  exports: [PresenceService, RoomService, EventsGateway],
})
export class RealtimeModule {}