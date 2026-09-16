# Task 1A-2: Database Schema Changes

**Agent:** Agent B
**Phase:** 1A — Foundation
**Depends on:** None
**Blocks:** 1A-5 (Conversation FSM), 1A-6 (Booking Orchestrator), 1A-8 (Passenger Flow)
**Effort:** 0.5 days

---

## Context

The WhatsApp booking flow needs database changes: a `source` column on trips for analytics, and `activeBooking`/`activeTripId`/`sessionExpiresAt` fields on WhatsApp conversations to track in-progress booking state separately from registration data.

---

## Exact Changes

### 1. Add TripSource enum and source column to Trip

**Modify:** `apps/api/prisma/schema.prisma`

Add after the existing enums (around line 170):
```prisma
enum TripSource {
  mobile_app
  whatsapp
  web
  admin
}
```

Find the Trip model (starts around line 701) and add inside the model body:
```prisma
  source                TripSource           @default(mobile_app) @map("source")
```

### 2. Add fields to WhatsAppConversation

**Modify:** `apps/api/prisma/schema.prisma`

Find the WhatsAppConversation model (starts around line 1804) and add inside the model body:
```prisma
  activeTripId          String?              @map("active_trip_id") @db.Uuid
  activeBooking         Json?                @map("active_booking") @db.JsonB
  sessionExpiresAt      DateTime?            @map("session_expires_at")
```

### 3. Create migration

```bash
cd apps/api
npx prisma migrate dev --name add-trip-source-and-whatsapp-booking-fields
```

### 4. Add TripSource to shared types

**Modify:** `packages/shared-types/src/enums.ts`

Add after the existing `TripStatus` enum (around line 24):
```typescript
export enum TripSource {
  MOBILE_APP = 'mobile_app',
  WHATSAPP = 'whatsapp',
  WEB = 'web',
  ADMIN = 'admin',
}
```

**Modify:** `packages/shared-types/src/domain.types.ts`

Find the `Trip` interface (around line 255) and add:
```typescript
  source: TripSource;
```

Add the import at the top of the file:
```typescript
import { TripSource } from './enums';
```

### 5. Update TripService to pass source

**Modify:** `apps/api/src/trips/trips.service.ts`

In `requestTrip()` method (line 1119), add `source` parameter to the method signature:
```typescript
async requestTrip(
  passengerId: string,
  dto: RequestTripRequest,
  source: TripSource = TripSource.MOBILE_APP,
): Promise<RequestTripResponse> {
```

In the INSERT SQL (line 1153), add `source` to the column list and values:
```sql
-- Add to column list (after city):
source,

-- Add to VALUES list (after ${tripCity ?? null}):
${source}::"TripSource",
```

### 6. Add import for TripSource in TripService

**Modify:** `apps/api/src/trips/trips.service.ts`

Add to the import from `@higo/shared-types` (line 34):
```typescript
TripSource,
```

---

## Acceptance Criteria

- [ ] `TripSource` enum exists in Prisma schema with 4 values
- [ ] `source` column exists on Trip model with default `mobile_app`
- [ ] `activeTripId`, `activeBooking`, `sessionExpiresAt` exist on WhatsAppConversation
- [ ] Migration runs successfully on dev database
- [ ] `TripSource` enum exported from `@higo/shared-types`
- [ ] `Trip` interface includes `source` field
- [ ] `TripService.requestTrip` accepts optional `source` parameter (default: `mobile_app`)
- [ ] `pnpm build api` compiles without errors

---

## Verification

```bash
cd apps/api
npx prisma migrate dev --name add-trip-source-and-whatsapp-booking-fields
npx prisma generate
pnpm build
# All should succeed
```
