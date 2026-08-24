import { Module } from '@nestjs/common';
import { FirebaseModule } from '../firebase/firebase.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { PushService } from './push.service';
import { WebPushService } from './web-push.service';

@Module({
  imports: [FirebaseModule, PrismaModule, RedisModule],
  providers: [PushService, WebPushService],
  exports: [PushService, WebPushService],
})
export class PushModule {}