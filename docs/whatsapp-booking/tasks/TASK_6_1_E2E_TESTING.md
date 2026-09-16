# Task 6-1: End-to-End Testing

**Agent:** Agent J
**Phase:** 6 — Polish + Testing
**Depends on:** All previous phases
**Blocks:** None
**Effort:** 3 days

---

## Context

Comprehensive testing of the entire WhatsApp booking flow — from "Hi" to trip completion. Includes unit tests, integration tests, and a manual test checklist.

---

## Exact Changes

### 1. Unit tests for Conversation FSM

**New file:** `apps/api/src/whatsapp/conversation.fsm.spec.ts`

```typescript
import { ConversationFSM, ConversationEvent } from './conversation.fsm';
import { ConversationState } from './whatsapp.types';

describe('ConversationFSM', () => {
  describe('transition', () => {
    it('should transition IDLE → AWAITING_PICKUP on book_ride', () => {
      const result = ConversationFSM.transition(ConversationState.IDLE, 'book_ride');
      expect(result).toBe(ConversationState.AWAITING_PICKUP);
    });

    it('should transition AWAITING_PICKUP → AWAITING_DESTINATION on pickup_received', () => {
      const result = ConversationFSM.transition(ConversationState.AWAITING_PICKUP, 'pickup_received');
      expect(result).toBe(ConversationState.AWAITING_DESTINATION);
    });

    it('should allow menu from any state', () => {
      const states = Object.values(ConversationState).filter(
        (s) => s !== ConversationState.HUMAN_HANDOFF,
      );
      for (const state of states) {
        const result = ConversationFSM.transition(state as ConversationState, 'menu');
        expect(result).toBe(ConversationState.IDLE);
      }
    });

    it('should return null for illegal transitions', () => {
      const result = ConversationFSM.transition(ConversationState.IDLE, 'trip_completed');
      expect(result).toBeNull();
    });

    it('should handle complete booking flow', () => {
      let state = ConversationState.IDLE;

      state = ConversationFSM.transition(state, 'book_ride')!;
      expect(state).toBe(ConversationState.AWAITING_PICKUP);

      state = ConversationFSM.transition(state, 'pickup_received')!;
      expect(state).toBe(ConversationState.AWAITING_DESTINATION);

      state = ConversationFSM.transition(state, 'destination_received')!;
      expect(state).toBe(ConversationState.SELECTING_VEHICLE);

      state = ConversationFSM.transition(state, 'vehicle_selected')!;
      expect(state).toBe(ConversationState.CONFIRMING_RIDE);

      state = ConversationFSM.transition(state, 'confirm_ride')!;
      expect(state).toBe(ConversationState.SELECTING_PAYMENT);

      state = ConversationFSM.transition(state, 'payment_selected')!;
      expect(state).toBe(ConversationState.WAITING_FOR_MATCH);

      state = ConversationFSM.transition(state, 'trip_matched')!;
      expect(state).toBe(ConversationState.TRIP_ACTIVE);

      state = ConversationFSM.transition(state, 'trip_completed')!;
      expect(state).toBe(ConversationState.AWAITING_RATING);

      state = ConversationFSM.transition(state, 'rating_submitted')!;
      expect(state).toBe(ConversationState.BOOKING_COMPLETED);
    });
  });
});
```

### 2. Unit tests for NLP Intent Service

**New file:** `apps/api/src/whatsapp/nlp-intent.service.spec.ts`

```typescript
import { NlpIntentService } from './nlp-intent.service';

describe('NlpIntentService', () => {
  let service: NlpIntentService;

  beforeEach(() => {
    service = new NlpIntentService();
  });

  it('should extract "from X to Y" pattern', () => {
    const result = service.extract('from Wuse Market to Airport');
    expect(result.intent).toBe('book_ride');
    expect(result.pickup).toContain('Wuse');
    expect(result.destination).toContain('Airport');
  });

  it('should detect vehicle type', () => {
    const result = service.extract('book keke to Garki');
    expect(result.vehicleType).toBe('keke');
  });

  it('should detect cancel intent', () => {
    const result = service.extract('cancel my ride');
    expect(result.intent).toBe('cancel');
  });

  it('should detect help intent', () => {
    const result = service.extract('help');
    expect(result.intent).toBe('help');
  });

  it('should resolve Nigerian landmarks', () => {
    const result = service.extract('from wuse to airport');
    expect(result.pickup).toBe('Wuse Market, Abuja');
    expect(result.destination).toBe('Nnamdi Azikiwe International Airport, Abuja');
  });

  it('should detect location-like input', () => {
    expect(service.isLocationInput('123 Wuse Market Road')).toBe(true);
    expect(service.isLocationInput('yes')).toBe(false);
  });
});
```

### 3. Unit tests for Navigation Service

**New file:** `apps/api/src/whatsapp/navigation.service.spec.ts`

```typescript
import { NavigationService } from './navigation.service';

describe('NavigationService', () => {
  let service: NavigationService;

  beforeEach(() => {
    service = new NavigationService();
  });

  it('should build pickup navigation URL', () => {
    const url = service.toPickup(9.0579, 7.4951);
    expect(url).toContain('google.com/maps/dir/');
    expect(url).toContain('destination=9.0579%2C7.4951');
    expect(url).toContain('dir_action=navigate');
    expect(url).not.toContain('origin=');
  });

  it('should build destination navigation URL', () => {
    const url = service.toDestination(9.0600, 7.4800);
    expect(url).toContain('destination=9.06%2C7.48');
  });

  it('should build full route URL with origin and destination', () => {
    const url = service.fullRoute(9.0579, 7.4951, 9.0600, 7.4800);
    expect(url).toContain('origin=9.0579%2C7.4951');
    expect(url).toContain('destination=9.06%2C7.48');
  });

  it('should format trip summary with nav links', () => {
    const summary = service.tripSummaryWithNav({
      pickupAddress: 'Wuse Market',
      pickupLat: 9.0579,
      pickupLng: 7.4951,
      destAddress: 'Airport',
      destLat: 9.0600,
      destLng: 7.4800,
      fare: 2500,
      vehicleType: 'keke',
    });
    expect(summary).toContain('Wuse Market');
    expect(summary).toContain('Airport');
    expect(summary).toContain('₦2,500');
    expect(summary).toContain('google.com/maps');
  });
});
```

### 4. Unit tests for Idempotency Service

**New file:** `apps/api/src/whatsapp/idempotency.service.spec.ts`

```typescript
import { IdempotencyService } from './idempotency.service';

describe('IdempotencyService', () => {
  // Mock Redis
  const mockRedis = {
    setNx: jest.fn(),
    del: jest.fn(),
  };

  let service: IdempotencyService;

  beforeEach(() => {
    service = new IdempotencyService(mockRedis as any);
    jest.clearAllMocks();
  });

  it('should return false for new messages (not duplicate)', async () => {
    mockRedis.setNx.mockResolvedValue(true);
    const result = await service.isDuplicateMessage('msg_123');
    expect(result).toBe(false);
    expect(mockRedis.setNx).toHaveBeenCalledWith('wa:idempotent:msg_123', '1', expect.any(Number));
  });

  it('should return true for duplicate messages', async () => {
    mockRedis.setNx.mockResolvedValue(false);
    const result = await service.isDuplicateMessage('msg_123');
    expect(result).toBe(true);
  });

  it('should generate ride creation key with conversation and time window', () => {
    const key = service.rideCreationKey('conv_123');
    expect(key).toMatch(/^ride:conv_123:\d+$/);
  });

  it('should generate payment init key with trip and amount', () => {
    const key = service.paymentInitKey('trip_456', 250000);
    expect(key).toBe('payment:trip_456:250000');
  });
});
```

### 5. Integration test for booking flow

**New file:** `apps/api/src/whatsapp/booking-flow.integration.spec.ts`

This tests the full flow with mocked services:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { BookingOrchestrator } from './booking-orchestrator.service';
import { ConversationFSM } from './conversation.fsm';
import { ConversationState } from './whatsapp.types';

describe('Booking Flow Integration', () => {
  // Mock all dependencies
  const mockPrisma = { /* ... */ };
  const mockTripService = { requestTrip: jest.fn(), getTrip: jest.fn() };
  const mockPricingService = { resolveRouteMetrics: jest.fn(), estimateFare: jest.fn() };
  const mockMatchingService = { findCandidates: jest.fn() };
  const mockMapsService = { placesAutocomplete: jest.fn(), placesDetails: jest.fn() };
  const mockEventEmitter = { emit: jest.fn() };

  let orchestrator: BookingOrchestrator;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingOrchestrator,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TripService, useValue: mockTripService },
        { provide: PricingService, useValue: mockPricingService },
        { provide: MatchingService, useValue: mockMatchingService },
        { provide: MapsService, useValue: mockMapsService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    orchestrator = module.get<BookingOrchestrator>(BookingOrchestrator);
  });

  it('should complete full booking flow', async () => {
    // 1. Start booking
    mockPrisma.whatsAppConversation.findUnique.mockResolvedValue({
      id: 'conv_1', conversationState: 'idle', role: 'passenger',
    });
    const startResult = await orchestrator.startBooking('conv_1');
    expect(startResult.state).toBe(ConversationState.AWAITING_PICKUP);

    // 2. Handle pickup
    mockPrisma.whatsAppConversation.findUnique.mockResolvedValue({
      id: 'conv_1', conversationState: 'awaiting_pickup', activeBooking: {},
    });
    mockMapsService.placesAutocomplete.mockResolvedValue([]);
    const pickupResult = await orchestrator.handlePickup('conv_1', {
      type: 'location', lat: 9.0579, lng: 7.4951, address: 'Wuse Market',
    });
    expect(pickupResult.state).toBe(ConversationState.AWAITING_DESTINATION);

    // ... more steps
  });
});
```

### 6. Manual test checklist

**New file:** `apps/api/src/whatsapp/TEST_CHECKLIST.md`

```markdown
# WhatsApp Booking Flow — Manual Test Checklist

## Registration
- [ ] Send "Hi" → see menu with registration buttons
- [ ] Tap "I want rides" → asked for name
- [ ] Enter name → asked for city
- [ ] Enter city → registration complete

## Booking Flow
- [ ] Send "book ride" → asked for pickup
- [ ] Share location pin → pickup accepted
- [ ] Type address → autocomplete results shown
- [ ] Select destination → vehicle options shown
- [ ] Select vehicle → confirmation with summary
- [ ] Tap "Confirm Ride" → trip created, searching for driver

## Trip Lifecycle
- [ ] Driver matched → passenger notified with driver details
- [ ] Driver arrived → passenger notified
- [ ] Trip started → passenger notified
- [ ] Trip completed → passenger asked to rate
- [ ] Rate 1-5 → rating submitted, thank you message

## Global Commands
- [ ] "menu" works from any state
- [ ] "help" shows support options
- [ ] "cancel" cancels active booking
- [ ] "back" goes to previous step
- [ ] "restart" clears everything

## Edge Cases
- [ ] Send image during booking → graceful handling
- [ ] Send voice note → graceful handling
- [ ] Send location when text expected → handled
- [ ] Send text when location expected → handled
- [ ] Double-tap button → idempotent (no duplicate)
- [ ] Wait 30 minutes → session expired prompt
- [ ] Active trip exists → show status instead of new booking

## Driver Flow (Phase 1B)
- [ ] Driver sends "online" → goes online
- [ ] Receive ride request → accept/decline buttons
- [ ] Accept → trip accepted, navigate to pickup
- [ ] Arrived → start trip button
- [ ] Start trip → navigate to destination
- [ ] Complete trip → trip completed
- [ ] Go offline → offline confirmation
```

---

## Acceptance Criteria

- [ ] Unit tests for Conversation FSM (all transitions)
- [ ] Unit tests for NLP Intent Service (extraction patterns)
- [ ] Unit tests for Navigation Service (URL generation)
- [ ] Unit tests for Idempotency Service (dedup logic)
- [ ] Integration test for booking flow (mocked services)
- [ ] Manual test checklist created
- [ ] All tests pass
- [ ] `pnpm build api` compiles without errors

---

## Verification

```bash
cd apps/api
pnpm test -- --testPathPattern=whatsapp
pnpm build
# All tests should pass
```
