import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { HceCacheService } from './hce-cache.service';
import { HceController } from './hce.controller';
import { HceService } from './hce.service';
import { HceSettingsService } from './hce-settings.service';
import { HceUsageService } from './hce-usage.service';

@Module({
  imports: [AiModule, PrismaModule, RedisModule],
  controllers: [HceController],
  providers: [HceService, HceSettingsService, HceUsageService, HceCacheService],
  exports: [HceService, HceSettingsService, HceUsageService],
})
export class HceModule {}
