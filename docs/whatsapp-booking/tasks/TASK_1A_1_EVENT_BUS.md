# Task 1A-1: Event Bus + Domain Events

**Agent:** Agent A
**Phase:** 1A — Foundation
**Depends on:** None
**Blocks:** 1A-9 (Notification Listener)
**Effort:** 0.5 days

---

## Context

HiGO currently has no domain event system. Cross-module communication is synchronous (direct NestJS injection) or via Bull queues (only for dispatch timeouts). The WhatsApp notification system needs to react to trip lifecycle events without TripService knowing WhatsApp exists.

This task installs `@nestjs/event-emitter` and creates the domain event classes that TripService will emit.

---

## Exact Changes

### 1. Install dependency

```bash
cd apps/api
pnpm add @nestjs/event-emitter
```

### 2. Create event classes

**New file:** `apps/api/src/trips/trip.events.ts`

```typescript
export class TripRequested {
  constructor(
    public readonly tripId: string,
    public readonly passengerId: string,
    public readonly pickup: { lat: number; lng: number; address: string },
    public readonly destination: { lat: number; lng: number; address: string },
    public readonly vehicleType: string,
    public readonly totalFare: number,
    public readonly distanceKm: number | null,
    public readonly durationMin: number | null,
    public readonly paymentMethod: string,
    public readonly source: string = 'mobile_app',
  ) {}
}

export class DriverMatched {
  constructor(
    public readonly tripId: string,
    public readonly driverId: string,
    public readonly driverName: string,
    public readonly driverPhone: string | null,
    public readonly driverVehicle: string | null,
    public readonly driverPlate: string | null,
    public readonly etaMinutes: number | null,
  ) {}
}

export class DriverArrived {
  constructor(
    public readonly tripId: string,
    public readonly driverId: string,
  ) {}
}

export class TripStarted {
  constructor(
    public readonly tripId: string,
    public readonly driverId: string,
  ) {}
}

export class TripCompleted {
  constructor(
    public readonly tripId: string,
    public readonly driverId: string,
    public readonly passengerId: string,
    public readonly totalFare: number,
    public readonly paymentMethod: string,
  ) {}
}

export class TripCancelled {
  constructor(
    public readonly tripId: string,
    public readonly passengerId: string,
    public readonly driverId: string | null,
    public readonly cancelledBy: 'passenger' | 'driver' | 'system',
    public readonly reason: string,
  ) {}
}

export class NoDriversAvailable {
  constructor(
    public readonly tripId: string,
    public readonly passengerId: string,
  ) {}
}
```

### 3. Enable EventEmitterModule in AppModule

**Modify:** `apps/api/src/app.module.ts`

Add import at top:
```typescript
import { EventEmitterModule } from '@nestjs/event-emitter';
```

Add to `imports` array (after `ConfigModule.forRoot`):
```typescript
EventEmitterModule.forRoot(),
```

---

## Acceptance Criteria

- [ ] `pnpm add @nestjs/event-emitter` succeeds
- [ ] `trip.events.ts` exports all 7 event classes
- [ ] `app.module.ts` imports `EventEmitterModule.forRoot()`
- [ ] `pnpm build api` compiles without errors

---

## Verification

```bash
cd apps/api
pnpm build
# Should compile with no errors
```
