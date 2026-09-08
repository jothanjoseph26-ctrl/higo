import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { HceModule } from './hce/hce.module';
import { HealthController } from './health.controller';
import { WhatsAppModule } from './whatsapp/whatsapp.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    PrismaModule,
    HceModule,
    WhatsAppModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
