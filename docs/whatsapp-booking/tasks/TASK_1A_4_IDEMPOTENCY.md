# Task 1A-4: Idempotency Service

**Agent:** Agent A
**Phase:** 1A — Foundation
**Depends on:** None
**Blocks:** 1A-8 (Passenger Flow)
**Effort:** 0.5 days

---

## Context

WhatsApp retries webhook delivery when the server responds too slowly, and users double-tap buttons. Without idempotency, a single "Confirm Ride" tap can create two trips or two payment attempts. This is a Phase 1 mandatory requirement.

The pattern already exists in `PaymentService.handleWebhook` (line 213) using `RedisService.setNx`. This task extracts it into a reusable service.

---

## Exact Changes

### 1. Create idempotency service

**New file:** `apps/api/src/whatsapp/idempotency.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const ACTION_LOCK_TTL = 30; // 30 seconds

@Injectable()
export class IdempotencyService {
  constructor(private readonly redis: RedisService) {}

  /**
   * Check if a WhatsApp message has already been processed.
   * Returns true if this is a duplicate.
   */
  async isDuplicateMessage(whatsappMessageId: string): Promise<boolean> {
    const key = `wa:idempotent:${whatsappMessageId}`;
    const isNew = await this.redis.setNx(key, '1', DEFAULT_TTL_SECONDS);
    return !isNew; // setNx returns true if key was NEW (not duplicate)
  }

  /**
   * Acquire a distributed lock for an action (e.g., ride creation, payment init).
   * Returns true if lock was acquired.
   */
  async acquireActionLock(actionKey: string, ttlSeconds: number = ACTION_LOCK_TTL): Promise<boolean> {
    const key = `wa:lock:${actionKey}`;
    return this.redis.setNx(key, '1', ttlSeconds);
  }

  /**
   * Release a distributed lock early.
   */
  async releaseActionLock(actionKey: string): Promise<void> {
    const key = `wa:lock:${actionKey}`;
    await this.redis.del(key);
  }

  /**
   * Generate an idempotency key for ride creation.
   * Ties to conversation + timestamp window to prevent double-booking.
   */
  rideCreationKey(conversationId: string): string {
    // Use 5-minute window so rapid taps don't create duplicates
    const window = Math.floor(Date.now() / (5 * 60 * 1000));
    return `ride:${conversationId}:${window}`;
  }

  /**
   * Generate an idempotency key for payment initialization.
   * Ties to trip + amount to prevent duplicate payment links.
   */
  paymentInitKey(tripId: string, amountKobo: number): string {
    return `payment:${tripId}:${amountKobo}`;
  }
}
```

### 2. Export from WhatsApp module

**Modify:** `apps/api/src/whatsapp/whatsapp.module.ts`

Add to providers and exports:
```typescript
providers: [WhatsAppService, IdempotencyService],
exports: [WhatsAppService, IdempotencyService],
```

Add import:
```typescript
import { IdempotencyService } from './idempotency.service';
```

---

## Acceptance Criteria

- [ ] `IdempotencyService` created with `isDuplicateMessage`, `acquireActionLock`, `releaseActionLock`, `rideCreationKey`, `paymentInitKey`
- [ ] Uses `RedisService.setNx` for atomic check-and-set
- [ ] Message dedup TTL is 7 days
- [ ] Action lock TTL is 30 seconds (configurable)
- [ ] Service exported from WhatsAppModule
- [ ] `pnpm build api` compiles without errors

---

## Verification

```bash
cd apps/api
pnpm build
# Verify Redis operations work by checking existing setNx usage in PaymentService
```
