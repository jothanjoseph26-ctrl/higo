import { Module } from '@nestjs/common';
import { FirebaseModule } from '../firebase/firebase.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PushService } from './push.service';

@Module({
  imports: [FirebaseModule, PrismaModule],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}