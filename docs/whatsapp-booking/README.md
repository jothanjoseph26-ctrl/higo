# HiGO WhatsApp Booking — Task Breakdown

**Objective:** Turn HiGO WhatsApp into a functional ride-booking channel that can complete a trip — request → matching → payment → ride → completion — without requiring the passenger to open the HiGO mobile app.

**Acceptance test:** A passenger who has never opened the HiGO mobile app must be able to send "Hi" on WhatsApp, register, request a ride, provide pickup/destination, receive a fare, confirm the ride, get matched with a driver, receive trip-status updates, complete the ride, and rate the driver — entirely through WhatsApp.

---

## Phase Overview

| Phase | Scope | Agents | Est. Effort | Dependencies |
|-------|-------|--------|-------------|--------------|
| **1A** | Foundation + Passenger MVP | 3 agents | 5-7 days | None |
| **1B** | Driver WhatsApp Flow | 2 agents | 3-4 days | Phase 1A complete |
| **2** | Payment Integration | 1 agent | 2 days | Phase 1A complete |
| **3** | Session Recovery + Error Handling | 1 agent | 2 days | Phase 1A complete |
| **4** | Analytics + Admin | 1 agent | 2 days | Phase 1A complete |
| **5** | NLP Intent Extraction | 1 agent | 2 days | Phase 1A complete |
| **6** | Polish + Testing | 2 agents | 3 days | All phases |

---

## Agent Task Files

Each task file is self-contained with: context, exact files to modify, acceptance criteria, and dependencies.

### Phase 1A — Foundation + Passenger MVP

| Task | Agent | File | Status |
|------|-------|------|--------|
| 1A-1: Event Bus + Domain Events | Agent A | [TASK_1A_1_EVENT_BUS.md](tasks/TASK_1A_1_EVENT_BUS.md) | |
| 1A-2: Database Schema Changes | Agent B | [TASK_1A_2_SCHEMA.md](tasks/TASK_1A_2_SCHEMA.md) | |
| 1A-3: WhatsApp Interactive Messages | Agent C | [TASK_1A_3_INTERACTIVE_MSGS.md](tasks/TASK_1A_3_INTERACTIVE_MSGS.md) | |
| 1A-4: Idempotency Service | Agent A | [TASK_1A_4_IDEMPOTENCY.md](tasks/TASK_1A_4_IDEMPOTENCY.md) | |
| 1A-5: Conversation FSM | Agent B | [TASK_1A_5_CONVERSATION_FSM.md](tasks/TASK_1A_5_CONVERSATION_FSM.md) | |
| 1A-6: Booking Orchestrator | Agent C | [TASK_1A_6_BOOKING_ORCHESTRATOR.md](tasks/TASK_1A_6_BOOKING_ORCHESTRATOR.md) | |
| 1A-7: Module Wiring | Agent A | [TASK_1A_7_MODULE_WIRING.md](tasks/TASK_1A_7_MODULE_WIRING.md) | |
| 1A-8: Passenger Booking Flow | Agent B+C | [TASK_1A_8_PASSENGER_FLOW.md](tasks/TASK_1A_8_PASSENGER_FLOW.md) | |
| 1A-9: WhatsApp Notification Listener | Agent A | [TASK_1A_9_NOTIFICATION_LISTENER.md](tasks/TASK_1A_9_NOTIFICATION_LISTENER.md) | |
| 1A-10: Navigation + Location | Agent C | [TASK_1A_10_NAV_LOCATION.md](tasks/TASK_1A_10_NAV_LOCATION.md) | |

### Phase 1B — Driver WhatsApp Flow

| Task | Agent | File | Status |
|------|-------|------|--------|
| 1B-1: Driver Conversation States | Agent D | [TASK_1B_1_DRIVER_STATES.md](tasks/TASK_1B_1_DRIVER_STATES.md) | |
| 1B-2: Driver Inbound Handler | Agent D | [TASK_1B_2_DRIVER_HANDLER.md](tasks/TASK_1B_2_DRIVER_HANDLER.md) | |
| 1B-3: Driver Trip Actions | Agent E | [TASK_1B_3_DRIVER_TRIP_ACTIONS.md](tasks/TASK_1B_3_DRIVER_TRIP_ACTIONS.md) | |
| 1B-4: Driver Location Tracking | Agent E | [TASK_1B_4_DRIVER_LOCATION.md](tasks/TASK_1B_4_DRIVER_LOCATION.md) | |

### Phase 2 — Payment Integration

| Task | Agent | File | Status |
|------|-------|------|--------|
| 2-1: Cash + Paystack Payment Flow | Agent F | [TASK_2_1_PAYMENT.md](tasks/TASK_2_1_PAYMENT.md) | |

### Phase 3 — Session Recovery + Error Handling

| Task | Agent | File | Status |
|------|-------|------|--------|
| 3-1: Session Recovery + Global Commands | Agent G | [TASK_3_1_SESSION_RECOVERY.md](tasks/TASK_3_1_SESSION_RECOVERY.md) | |

### Phase 4 — Analytics + Admin

| Task | Agent | File | Status |
|------|-------|------|--------|
| 4-1: Analytics Funnel Tracking | Agent H | [TASK_4_1_ANALYTICS.md](tasks/TASK_4_1_ANALYTICS.md) | |

### Phase 5 — NLP Intent Extraction

| Task | Agent | File | Status |
|------|-------|------|--------|
| 5-1: NLP Intent/Entity Extraction | Agent I | [TASK_5_1_NLP.md](tasks/TASK_5_1_NLP.md) | |

### Phase 6 — Polish + Testing

| Task | Agent | File | Status |
|------|-------|------|--------|
| 6-1: End-to-End Testing | Agent J | [TASK_6_1_E2E_TESTING.md](tasks/TASK_6_1_E2E_TESTING.md) | |

---

## Dependency Graph

```
Phase 1A (parallel where possible):
  1A-1 (Event Bus) ──────────────────┐
  1A-2 (Schema) ─────────────────────┤
  1A-3 (Interactive Msgs) ──────────┤
  1A-4 (Idempotency) ───────────────┤
  1A-5 (Conversation FSM) ──────────┤
  1A-6 (Booking Orchestrator) ──────┤──→ 1A-8 (Passenger Flow)
  1A-7 (Module Wiring) ─────────────┘    │
  1A-9 (Notification Listener) ──────────┤
  1A-10 (Nav + Location) ────────────────┘

Phase 1B (after 1A-8):
  1B-1 → 1B-2 → 1B-3
  1B-4 (parallel with 1B-2/3)

Phase 2-5 (parallel, after 1A-8):
  2-1 (Payment)
  3-1 (Session Recovery)
  4-1 (Analytics)
  5-1 (NLP)

Phase 6 (after all):
  6-1 (E2E Testing)
```

---

## Key Architecture Decisions

1. **Event-driven decoupling**: TripService emits domain events; WhatsAppNotificationListener subscribes. TripService never knows WhatsApp exists.
2. **Two state machines**: Conversation FSM (bot flow) is separate from Trip FSM (backend record). They are linked, not identical.
3. **Channel-agnostic Orchestrator**: Booking logic lives in BookingOrchestrator, not in whatsapp.service.ts. WhatsApp layer is a thin adapter.
4. **Navigation via Google Maps URLs**: No in-app navigation. Send `https://www.google.com/maps/dir/?api=1&destination=...&dir_action=navigate` links.
5. **Location via WhatsApp pin drops**: Static location messages only (lat/lng). Live Location not supported via Business API.
6. **Cash-only for Phase 1A**: Paystack integration deferred to Phase 2 to reduce initial complexity.
7. **Idempotent webhooks**: Message dedup via Redis setNx before any processing. Non-negotiable.

---

## Codebase Reference

| What | Where |
|------|-------|
| WhatsApp module | `apps/api/src/whatsapp/` |
| TripService | `apps/api/src/trips/trips.service.ts` |
| MatchingService | `apps/api/src/matching/matching.service.ts` |
| PricingService | `apps/api/src/pricing/` |
| MapsService | `apps/api/src/maps/maps.service.ts` |
| PaymentService | `apps/api/src/payments/payment.service.ts` |
| EventsGateway | `apps/api/src/realtime/events.gateway.ts` |
| RedisService | `apps/api/src/redis/redis.service.ts` (Global module) |
| Prisma schema | `apps/api/prisma/schema.prisma` |
| Shared types | `packages/shared-types/src/` |
| App module | `apps/api/src/app.module.ts` |
| Worker process | `apps/api/src/worker.ts` |
