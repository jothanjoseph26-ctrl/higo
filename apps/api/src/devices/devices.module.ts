import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { ClientInstallationService } from './client-installation.service';
import { ClientTelemetryInterceptor } from './client-telemetry.interceptor';
import { DevicesController } from './devices.controller';
import { PlayIntegrityService } from './play-integrity.service';

@Global()
@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [DevicesController],
  providers: [
    ClientInstallationService,
    ClientTelemetryInterceptor,
    PlayIntegrityService,
  ],
  exports: [
    ClientInstallationService,
    ClientTelemetryInterceptor,
    PlayIntegrityService,
  ],
})
export class DevicesModule {}
