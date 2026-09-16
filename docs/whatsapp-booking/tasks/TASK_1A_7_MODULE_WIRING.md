# Task 1A-7: Module Wiring

**Agent:** Agent A
**Phase:** 1A — Foundation
**Depends on:** 1A-1 (Event Bus), 1A-4 (Idempotency)
**Blocks:** 1A-8 (Passenger Flow)
**Effort:** 0.5 days

---

## Context

The WhatsApp module is currently commented out in `app.module.ts` (line 91) and only imports `PrismaModule`. It needs to be re-enabled and wired to all the services the Booking Orchestrator needs.

---

## Exact Changes

### 1. Update WhatsAppModule imports

**Modify:** `apps/api/src/whatsapp/whatsapp.module.ts`

Replace the entire file:

```typescript
import { Module } from '@nestjs/common';
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
import { BookingOrchestrator } from './booking-orchestrator.service';
import { IdempotencyService } from './idempotency.service';
import { WhatsAppNotificationListener } from './notification.listener';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    TripsModule,
    MatchingModule,
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
  ],
  exports: [WhatsAppService, BookingOrchestrator, IdempotencyService],
})
export class WhatsAppModule {}
```

### 2. Re-enable WhatsAppModule in AppModule

**Modify:** `apps/api/src/app.module.ts`

Change line 91 from:
```typescript
// WhatsAppModule, // TODO: re-enable once circular dependency is resolved
```

To:
```typescript
WhatsAppModule,
```

### 3. Fix circular dependency if it occurs

If the build fails with a circular dependency error (WhatsApp → Trips → Matching → WhatsApp), use `forwardRef`:

In `whatsapp.module.ts`, wrap module imports:
```typescript
import { Module, forwardRef } from '@nestjs/common';
// ...
imports: [
  // ...
  forwardRef(() => TripsModule),
  forwardRef(() => MatchingModule),
  // ...
],
```

---

## Acceptance Criteria

- [ ] `WhatsAppModule` imports all required modules (Trips, Matching, Pricing, Maps, Payments, Redis, Hce, Push)
- [ ] `BookingOrchestrator`, `IdempotencyService`, `WhatsAppNotificationListener` registered as providers
- [ ] `WhatsAppModule` is uncommented in `app.module.ts`
- [ ] No circular dependency errors
- [ ] `pnpm build api` compiles without errors

---

## Verification

```bash
cd apps/api
pnpm build
# Should compile with no circular dependency errors
# Check: WhatsAppModule is in the module graph
```
