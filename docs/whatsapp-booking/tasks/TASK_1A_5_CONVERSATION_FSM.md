# Task 1A-5: Conversation FSM (Finite State Machine)

**Agent:** Agent B
**Phase:** 1A — Foundation
**Depends on:** 1A-2 (Schema — needs `activeBooking` field)
**Blocks:** 1A-6 (Booking Orchestrator), 1A-8 (Passenger Flow)
**Effort:** 1 day

---

## Context

The current WhatsApp conversation handling uses a flat enum with if/else branching in `generateResponse`. This task creates a formal FSM that makes illegal transitions structurally impossible, handles "invalid input for current state" gracefully, and separates conversation state from trip state.

Two separate state machines:
1. **Conversation FSM** — governs what the bot expects next (this task)
2. **Trip FSM** — the backend's actual record of the ride (already exists in `trip-state-machine.ts`)

---

## Exact Changes

### 1. Define conversation states

**Modify:** `apps/api/src/whatsapp/whatsapp.types.ts`

Replace the existing `WhatsAppConversationState` enum with:

```typescript
export enum ConversationState {
  // Registration (existing)
  IDLE = 'idle',
  AWAITING_PASSENGER_NAME = 'awaiting_passenger_name',
  AWAITING_PASSENGER_CITY = 'awaiting_passenger_city',
  AWAITING_PASSENGER_REFERRAL = 'awaiting_passenger_referral',
  AWAITING_DRIVER_NAME = 'awaiting_driver_name',
  AWAITING_DRIVER_VEHICLE = 'awaiting_driver_vehicle',
  AWAITING_DRIVER_CITY = 'awaiting_driver_city',

  // Booking flow (new)
  AWAITING_PICKUP = 'awaiting_pickup',
  AWAITING_DESTINATION = 'awaiting_awaiting_destination',
  SELECTING_VEHICLE = 'selecting_vehicle',
  CONFIRMING_RIDE = 'confirming_ride',
  SELECTING_PAYMENT = 'selecting_payment',
  WAITING_FOR_MATCH = 'waiting_for_match',
  TRIP_ACTIVE = 'trip_active',
  AWAITING_RATING = 'awaiting_rating',
  BOOKING_COMPLETED = 'booking_completed',

  // Special
  HUMAN_HANDOFF = 'human_handoff',
}

// Backward compatibility — map old enum values to new
export const WhatsAppConversationState = ConversationState;
```

### 2. Create the FSM

**New file:** `apps/api/src/whatsapp/conversation.fsm.ts`

```typescript
import { ConversationState } from './whatsapp.types';

export type ConversationEvent =
  // Registration events
  | 'register_passenger'
  | 'register_driver'
  | 'name_provided'
  | 'city_provided'
  | 'vehicle_provided'

  // Booking events
  | 'book_ride'
  | 'pickup_received'
  | 'destination_received'
  | 'vehicle_selected'
  | 'confirm_ride'
  | 'payment_selected'
  | 'trip_matched'
  | 'trip_active'
  | 'trip_completed'
  | 'rating_submitted'
  | 'no_drivers'

  // Navigation events
  | 'menu'
  | 'help'
  | 'cancel'
  | 'back'
  | 'restart'
  | 'talk_to_human'

  // System events
  | 'session_expired'
  | 'unexpected_input';

interface Transition {
  from: ConversationState;
  to: ConversationState;
  event: ConversationEvent;
}

const TRANSITIONS: Transition[] = [
  // Registration flow (existing)
  { from: ConversationState.IDLE, event: 'register_passenger', to: ConversationState.AWAITING_PASSENGER_NAME },
  { from: ConversationState.IDLE, event: 'register_driver', to: ConversationState.AWAITING_DRIVER_NAME },
  { from: ConversationState.AWAITING_PASSENGER_NAME, event: 'name_provided', to: ConversationState.AWAITING_PASSENGER_CITY },
  { from: ConversationState.AWAITING_PASSENGER_CITY, event: 'city_provided', to: ConversationState.IDLE },
  { from: ConversationState.AWAITING_DRIVER_NAME, event: 'name_provided', to: ConversationState.AWAITING_DRIVER_VEHICLE },
  { from: ConversationState.AWAITING_DRIVER_VEHICLE, event: 'vehicle_provided', to: ConversationState.AWAITING_DRIVER_CITY },
  { from: ConversationState.AWAITING_DRIVER_CITY, event: 'city_provided', to: ConversationState.IDLE },

  // Booking flow (new)
  { from: ConversationState.IDLE, event: 'book_ride', to: ConversationState.AWAITING_PICKUP },
  { from: ConversationState.AWAITING_PICKUP, event: 'pickup_received', to: ConversationState.AWAITING_DESTINATION },
  { from: ConversationState.AWAITING_DESTINATION, event: 'destination_received', to: ConversationState.SELECTING_VEHICLE },
  { from: ConversationState.SELECTING_VEHICLE, event: 'vehicle_selected', to: ConversationState.CONFIRMING_RIDE },
  { from: ConversationState.CONFIRMING_RIDE, event: 'confirm_ride', to: ConversationState.SELECTING_PAYMENT },
  { from: ConversationState.CONFIRMING_RIDE, event: 'pickup_received', to: ConversationState.AWAITING_DESTINATION }, // change pickup
  { from: ConversationState.CONFIRMING_RIDE, event: 'destination_received', to: ConversationState.SELECTING_VEHICLE }, // change destination
  { from: ConversationState.SELECTING_PAYMENT, event: 'payment_selected', to: ConversationState.WAITING_FOR_MATCH },
  { from: ConversationState.WAITING_FOR_MATCH, event: 'trip_matched', to: ConversationState.TRIP_ACTIVE },
  { from: ConversationState.WAITING_FOR_MATCH, event: 'no_drivers', to: ConversationState.IDLE },
  { from: ConversationState.TRIP_ACTIVE, event: 'trip_completed', to: ConversationState.AWAITING_RATING },
  { from: ConversationState.AWAITING_RATING, event: 'rating_submitted', to: ConversationState.BOOKING_COMPLETED },
  { from: ConversationState.BOOKING_COMPLETED, event: 'book_ride', to: ConversationState.AWAITING_PICKUP },
  { from: ConversationState.BOOKING_COMPLETED, event: 'menu', to: ConversationState.IDLE },

  // Global transitions (available from ANY state)
  ...Object.values(ConversationState)
    .filter((s) => s !== ConversationState.HUMAN_HANDOFF)
    .flatMap((state) => [
      { from: state, event: 'menu', to: ConversationState.IDLE } as Transition,
      { from: state, event: 'help', to: ConversationState.HUMAN_HANDOFF } as Transition,
      { from: state, event: 'restart', to: ConversationState.IDLE } as Transition,
      { from: state, event: 'cancel', to: ConversationState.IDLE } as Transition,
      { from: state, event: 'session_expired', to: ConversationState.IDLE } as Transition,
    ]),
];

// Build lookup map: `state:event` → next state
const TRANSITION_MAP: Map<string, ConversationState> = new Map();
for (const t of TRANSITIONS) {
  TRANSITION_MAP.set(`${t.from}:${t.event}`, t.to);
}

export class ConversationFSM {
  /**
   * Attempt a state transition.
   * Returns the new state if valid, or null if the transition is illegal.
   */
  static transition(currentState: ConversationState, event: ConversationEvent): ConversationState | null {
    const key = `${currentState}:${event}`;
    return TRANSITION_MAP.get(key) ?? null;
  }

  /**
   * Check if a transition is valid without executing it.
   */
  static canTransition(currentState: ConversationState, event: ConversationEvent): boolean {
    return TRANSITION_MAP.has(`${currentState}:${event}`);
  }

  /**
   * Get all valid events for a given state.
   */
  static validEvents(state: ConversationState): ConversationEvent[] {
    return Array.from(TRANSITION_MAP.entries())
      .filter(([key]) => key.startsWith(`${state}:`))
      .map(([, to]) => to as unknown as ConversationEvent);
  }

  /**
   * Check if a state is a terminal/end state for a booking flow.
   */
  static isTerminal(state: ConversationState): boolean {
    return state === ConversationState.BOOKING_COMPLETED ||
           state === ConversationState.HUMAN_HANDOFF;
  }

  /**
   * Check if a state requires trip data.
   */
  static requiresTripData(state: ConversationState): boolean {
    return state === ConversationState.TRIP_ACTIVE ||
           state === ConversationState.AWAITING_RATING;
  }
}
```

### 3. Add backward compatibility alias

**Modify:** `apps/api/src/whatsapp/whatsapp.types.ts`

Keep the old enum name as an alias:
```typescript
// Backward compatibility — old code referencing WhatsAppConversationState still works
export const WhatsAppConversationState = ConversationState;
```

---

## Acceptance Criteria

- [ ] `ConversationState` enum covers all booking flow states
- [ ] `WhatsAppConversationState` is aliased for backward compatibility
- [ ] `ConversationFSM.transition()` returns next state or null for illegal transitions
- [ ] Global transitions (menu, help, cancel, restart) work from any state
- [ ] `isTerminal()` correctly identifies end states
- [ ] `requiresTripData()` correctly identifies states that need trip info
- [ ] No circular transitions that could cause infinite loops
- [ ] `pnpm build api` compiles without errors

---

## Verification

```bash
cd apps/api
pnpm build
# Verify: IDLE + book_ride → AWAITING_PICKUP
# Verify: AWAITING_PICKUP + pickup_received → AWAITING_DESTINATION
# Verify: any state + menu → IDLE
# Verify: any state + help → HUMAN_HANDOFF
# Verify: IDLE + trip_matched → null (illegal)
```
