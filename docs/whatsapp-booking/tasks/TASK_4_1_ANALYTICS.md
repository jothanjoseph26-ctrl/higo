# Task 4-1: Analytics Funnel Tracking

**Agent:** Agent H
**Phase:** 4 — Analytics
**Depends on:** Phase 1A complete
**Blocks:** None
**Effort:** 2 days

---

## Context

Track the WhatsApp booking funnel from session start to trip completion. Use Redis counters for real-time metrics, periodically flush to database.

---

## Exact Changes

### 1. Create analytics service

**New file:** `apps/api/src/whatsapp/analytics.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';

export type FunnelEvent =
  | 'session_started'
  | 'registration_started'
  | 'registration_completed'
  | 'booking_started'
  | 'pickup_received'
  | 'destination_received'
  | 'fare_generated'
  | 'vehicle_selected'
  | 'booking_confirmed'
  | 'driver_search_started'
  | 'driver_matched'
  | 'payment_started'
  | 'payment_completed'
  | 'trip_started'
  | 'trip_completed'
  | 'trip_cancelled'
  | 'rating_submitted';

@Injectable()
export class WhatsAppAnalytics {
  private readonly logger = new Logger(WhatsAppAnalytics.name);

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  async track(
    event: FunnelEvent,
    conversationId: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const hour = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH

    // Increment daily counter
    await this.redis.incr(`wa:analytics:${date}:${event}`);
    // Increment hourly counter
    await this.redis.incr(`wa:analytics:${hour}:${event}`);
    // Track unique conversations per event per day
    await this.redis.raw.sadd(`wa:analytics:${date}:${event}:conversations`, conversationId);
    await this.redis.expire(`wa:analytics:${date}:${event}:conversations`, 30 * 24 * 60 * 60);

    // Store event log (last 1000 events)
    const logEntry = JSON.stringify({
      event,
      conversationId,
      timestamp: new Date().toISOString(),
      metadata,
    });
    await this.redis.raw.lpush('wa:analytics:log', logEntry);
    await this.redis.raw.ltrim('wa:analytics:log', 0, 999);
  }

  async getDailyStats(date: string): Promise<Record<string, { count: number; unique: number }>> {
    const events: FunnelEvent[] = [
      'session_started', 'booking_started', 'pickup_received',
      'destination_received', 'fare_generated', 'vehicle_selected',
      'booking_confirmed', 'driver_search_started', 'driver_matched',
      'trip_started', 'trip_completed', 'trip_cancelled', 'rating_submitted',
    ];

    const stats: Record<string, { count: number; unique: number }> = {};

    for (const event of events) {
      const countStr = await this.redis.get(`wa:analytics:${date}:${event}`);
      const count = countStr ? parseInt(countStr, 10) : 0;
      const unique = await this.redis.raw.scard(`wa:analytics:${date}:${event}:conversations`);
      stats[event] = { count, unique };
    }

    return stats;
  }

  async getConversionRate(date: string): Promise<{
    sessionToBooking: number;
    bookingToMatch: number;
    matchToComplete: number;
    overallConversion: number;
  }> {
    const stats = await this.getDailyStats(date);

    const sessionStarted = stats.session_started?.unique || 1;
    const bookingConfirmed = stats.booking_confirmed?.unique || 0;
    const driverMatched = stats.driver_matched?.unique || 0;
    const tripCompleted = stats.trip_completed?.unique || 0;

    return {
      sessionToBooking: Math.round((bookingConfirmed / sessionStarted) * 100),
      bookingToMatch: Math.round((driverMatched / bookingConfirmed) * 100),
      matchToComplete: Math.round((tripCompleted / driverMatched) * 100),
      overallConversion: Math.round((tripCompleted / sessionStarted) * 100),
    };
  }

  @Cron(CronExpression.EVERY_HOUR)
  async flushToDatabase(): Promise<void> {
    // Hourly flush — optional, for persistence beyond Redis TTL
    try {
      const date = new Date().toISOString().slice(0, 10);
      const stats = await this.getDailyStats(date);

      // Upsert daily stats to database
      await this.prisma.$executeRaw`
        INSERT INTO whatsapp_analytics (id, date, stats, created_at)
        VALUES (${crypto.randomUUID()}, ${date}::date, ${JSON.stringify(stats)}::jsonb, NOW())
        ON CONFLICT (date) DO UPDATE SET stats = ${JSON.stringify(stats)}::jsonb, updated_at = NOW()
      `;
    } catch (error) {
      this.logger.error(`Failed to flush analytics: ${error.message}`);
    }
  }
}
```

### 2. Add analytics table to schema

**Modify:** `apps/api/prisma/schema.prisma`

Add at the end:
```prisma
model WhatsAppAnalytic {
  id        String   @id @default(uuid()) @db.Uuid
  date      DateTime @unique @db.Date
  stats     Json     @db.JsonB
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("whatsapp_analytics")
}
```

Create migration.

### 3. Track events in BookingOrchestrator

**Modify:** `apps/api/src/whatsapp/booking-orchestrator.service.ts`

Add analytics calls at each funnel step:

```typescript
// In startBooking:
await this.analytics.track('booking_started', conversationId);

// In handlePickup:
await this.analytics.track('pickup_received', conversationId);

// In handleDestination:
await this.analytics.track('destination_received', conversationId);
await this.analytics.track('fare_generated', conversationId);

// In selectVehicle:
await this.analytics.track('vehicle_selected', conversationId);

// In confirmRide:
await this.analytics.track('booking_confirmed', conversationId);
```

### 4. Track events in NotificationListener

**Modify:** `apps/api/src/whatsapp/notification.listener.ts`

```typescript
// In handleTripRequested:
await this.analytics.track('driver_search_started', conversation.id);

// In handleDriverMatched:
await this.analytics.track('driver_matched', conversation.id);

// In handleTripStarted:
await this.analytics.track('trip_started', conversation.id);

// In handleTripCompleted:
await this.analytics.track('trip_completed', conversation.id);

// In handleTripCancelled:
await this.analytics.track('trip_cancelled', conversation.id);
```

---

## Acceptance Criteria

- [ ] `WhatsAppAnalytics` service created with `track`, `getDailyStats`, `getConversionRate`
- [ ] Daily and hourly counters in Redis
- [ ] Unique conversation tracking per event per day
- [ ] Event log (last 1000 events) in Redis list
- [ ] Hourly flush to `whatsapp_analytics` database table
- [ ] Conversion rate calculated: session→booking→match→complete
- [ ] Analytics tracked at each funnel step in Orchestrator and Listener
- [ ] `pnpm build api` compiles without errors

---

## Verification

```bash
cd apps/api
pnpm build
# Verify: analytics counters increment on each event
# Verify: conversion rate calculation works
# Verify: hourly flush to database
```
