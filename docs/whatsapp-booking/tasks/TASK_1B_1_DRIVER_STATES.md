# Task 1B-1: Driver WhatsApp Conversation States

**Agent:** Agent D
**Phase:** 1B — Driver WhatsApp
**Depends on:** Phase 1A complete
**Blocks:** 1B-2 (Driver Handler)
**Effort:** 0.5 days

---

## Context

The driver WhatsApp flow needs its own conversation states separate from the passenger flow. Drivers need to: go online/offline, receive ride requests, accept/decline, confirm arrival, start trip, complete trip, and rate passengers.

---

## Exact Changes

### 1. Add driver-specific conversation states

**Modify:** `apps/api/src/whatsapp/whatsapp.types.ts`

Add to `ConversationState` enum:
```typescript
// Driver-specific states
DRIVER_IDLE = 'driver_idle',
DRIVER_ONLINE = 'driver_online',
DRIVER_INCOMING_REQUEST = 'driver_incoming_request',
DRIVER_ACCEPTED_TRIP = 'driver_accepted_trip',
DRIVER_NAVIGATING_TO_PICKUP = 'driver_navigating_to_pickup',
DRIVER_ARRIVED = 'driver_arrived',
DRIVER_TRIP_IN_PROGRESS = 'driver_trip_in_progress',
DRIVER_AWAITING_PASSENGER_RATING = 'driver_awaiting_passenger_rating',
```

### 2. Add driver events to FSM

**Modify:** `apps/api/src/whatsapp/conversation.fsm.ts`

Add to `ConversationEvent` type:
```typescript
// Driver events
| 'go_online'
| 'go_offline'
| 'accept_trip'
| 'decline_trip'
| 'arrived_at_pickup'
| 'start_trip'
| 'complete_trip'
| 'rate_passenger'
| 'trip_assigned'
```

Add driver transitions:
```typescript
// Driver flow
{ from: ConversationState.DRIVER_IDLE, event: 'go_online', to: ConversationState.DRIVER_ONLINE },
{ from: ConversationState.DRIVER_ONLINE, event: 'go_offline', to: ConversationState.DRIVER_IDLE },
{ from: ConversationState.DRIVER_ONLINE, event: 'trip_assigned', to: ConversationState.DRIVER_INCOMING_REQUEST },
{ from: ConversationState.DRIVER_INCOMING_REQUEST, event: 'accept_trip', to: ConversationState.DRIVER_ACCEPTED_TRIP },
{ from: ConversationState.DRIVER_INCOMING_REQUEST, event: 'decline_trip', to: ConversationState.DRIVER_ONLINE },
{ from: ConversationState.DRIVER_ACCEPTED_TRIP, event: 'arrived_at_pickup', to: ConversationState.DRIVER_ARRIVED },
{ from: ConversationState.DRIVER_ARRIVED, event: 'start_trip', to: ConversationState.DRIVER_TRIP_IN_PROGRESS },
{ from: ConversationState.DRIVER_TRIP_IN_PROGRESS, event: 'complete_trip', to: ConversationState.DRIVER_AWAITING_PASSENGER_RATING },
{ from: ConversationState.DRIVER_AWAITING_PASSENGER_RATING, event: 'rate_passenger', to: ConversationState.DRIVER_ONLINE },
```

### 3. Add driver role detection

**Modify:** `apps/api/src/whatsapp/whatsapp.types.ts`

Add to `WhatsAppRole` enum:
```typescript
export enum WhatsAppRole {
  PASSENGER = 'passenger',
  DRIVER = 'driver',
  DISPATCH = 'dispatch',
  UNKNOWN = 'unknown',
}
```

The role is already set during registration. No change needed here.

---

## Acceptance Criteria

- [ ] 8 new driver-specific states added to `ConversationState`
- [ ] 9 new driver events added to `ConversationEvent`
- [ ] All driver transitions defined in FSM
- [ ] Driver states are separate from passenger states (no overlap)
- [ ] Global transitions (menu, help, cancel) work from driver states
- [ ] `pnpm build api` compiles without errors

---

## Verification

```bash
cd apps/api
pnpm build
# Verify: DRIVER_IDLE + go_online → DRIVER_ONLINE
# Verify: DRIVER_ONLINE + trip_assigned → DRIVER_INCOMING_REQUEST
# Verify: DRIVER_INCOMING_REQUEST + accept_trip → DRIVER_ACCEPTED_TRIP
```
