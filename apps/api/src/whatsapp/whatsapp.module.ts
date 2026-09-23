import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { TripsModule } from '../trips/trips.module';
import { MatchingModule } from '../matching/matching.module';
import { PricingModule } from '../pricing/pricing.module';
import { MapsModule } from '../maps/maps.module';
import { PaymentsModule } from '../payments/payments.module';
import { HceModule } from '../hce/hce.module';
import { PushModule } from '../push/push.module';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';
import { IdempotencyService } from './idempotency.service';
import { BookingOrchestrator } from './booking-orchestrator.service';
import { WhatsAppNotificationListener } from './notification.listener';
import { NavigationService } from './navigation.service';
import { WhatsAppSocketBridge } from './whatsapp-socket-bridge.service';
import { SessionCleanupJob } from './session-cleanup.job';
import { WhatsAppAnalytics } from './analytics.service';
import { NlpIntentService } from './nlp-intent.service';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    forwardRef(() => TripsModule),
    forwardRef(() => MatchingModule),
    PricingModule,
    MapsModule,
    PaymentsModule,
    HceModule,
    PushModule,
  ],
  controllers: [WhatsAppController],
  providers: [
    WhatsAppService,
    BookingOrchestrator,
    IdempotencyService,
    WhatsAppNotificationListener,
    NavigationService,
    WhatsAppSocketBridge,
    SessionCleanupJob,
    WhatsAppAnalytics,
    NlpIntentService,
  ],
  exports: [WhatsAppService, BookingOrchestrator, IdempotencyService, NavigationService, WhatsAppAnalytics, NlpIntentService],
})
export class WhatsAppModule {}
