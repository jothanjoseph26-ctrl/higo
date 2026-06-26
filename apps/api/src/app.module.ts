import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { BullModule } from '@nestjs/bull';
import { envSchema } from './config/env.schema';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { AuthGuard } from './common/guards/auth.guard';
import { RateLimitGuard } from './common/guards/rate-limit.guard';
import { CryptoModule } from './common/crypto/crypto.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { S3Module } from './s3/s3.module';
import { AuthModule } from './auth/auth.module';
import { RealtimeModule } from './realtime/realtime.module';
import { HealthModule } from './health/health.module';
import { KycModule } from './kyc/kyc.module';
import { PaymentsModule } from './payments/payments.module';
import { ZonesModule } from './zones/zones.module';
import { PricingModule } from './pricing/pricing.module';
import { MatchingModule } from './matching/matching.module';
import { TripsModule } from './trips/trips.module';
import { PassengersModule } from './passengers/passengers.module';
import { DriversModule } from './drivers/drivers.module';
import { AdminModule } from './admin/admin.module';
import { SmsModule } from './sms/sms.module';
import { AiModule } from './ai/ai.module';
import { FirebaseModule } from './firebase/firebase.module';
import { PushModule } from './push/push.module';
import { MapsModule } from './maps/maps.module';
import { PromosModule } from './promos/promos.module';
import { MessagesModule } from './messages/messages.module';
import { EmailModule } from './email/email.module';
import { JobsModule } from './jobs/jobs.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env.local', '../../.env', '.env.local', '.env'],
      validationSchema: envSchema,
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (config: ConfigService) => ({
        redis: config.getOrThrow<string>('REDIS_URL'),
      }),
      inject: [ConfigService],
    }),
    CryptoModule,
    PrismaModule,
    RedisModule,
    FirebaseModule,
    PushModule,
    S3Module,
    AuthModule,
    SmsModule,
    RealtimeModule,
    HealthModule,
    PaymentsModule,
    KycModule,
    ZonesModule,
    PricingModule,
    MatchingModule,
    TripsModule,
    PassengersModule,
    DriversModule,
    AdminModule,
    AiModule,
    MapsModule,
    PromosModule,
    MessagesModule,
    EmailModule,
    JobsModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule {}
