import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { RedisModule } from '../../redis/redis.module';
import { PresenceService } from './presence.service';
import { PresenceInterceptor } from './presence.interceptor';

@Global()
@Module({
  imports: [PrismaModule, RedisModule],
  providers: [PresenceService, PresenceInterceptor],
  exports: [PresenceService, PresenceInterceptor],
})
export class PresenceModule {}
