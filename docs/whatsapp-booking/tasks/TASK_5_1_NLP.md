# Task 5-1: NLP Intent/Entity Extraction

**Agent:** Agent I
**Phase:** 5 — NLP
**Depends on:** Phase 1A complete
**Blocks:** None
**Effort:** 2 days

---

## Context

Route free-text input through a lightweight NLP/intent classifier before falling back to strict menu matching. If a user types "I need a ride from Wuse Market to the Airport," extract pickup, destination, and intent in one pass and jump to the fare-confirmation step.

---

## Exact Changes

### 1. Create NLP service

**New file:** `apps/api/src/whatsapp/nlp-intent.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';

export interface ExtractedEntities {
  intent: 'book_ride' | 'cancel' | 'status' | 'help' | 'menu' | 'unknown';
  pickup?: string;
  destination?: string;
  vehicleType?: string;
  paymentMethod?: string;
  rating?: number;
}

@Injectable()
export class NlpIntentService {
  private readonly logger = new Logger(NlpIntentService.name);

  // Intent patterns
  private readonly INTENT_PATTERNS: Array<{ intent: ExtractedEntities['intent']; patterns: RegExp[] }> = [
    {
      intent: 'book_ride',
      patterns: [
        /(?:book|need|want|get)\s+(?:a\s+)?(?:ride|trip|keke|car|bike)/i,
        /(?:from|pickup)\s+.+\s+(?:to|dest|drop)/i,
        /(?:take|go)\s+me\s+(?:to|from)/i,
        /(?:how\s+(?:do\s+)?i\s+get\s+to)/i,
      ],
    },
    {
      intent: 'cancel',
      patterns: [
        /(?:cancel|abort|stop)\s+(?:ride|trip|booking)/i,
        /never\s*mind/i,
      ],
    },
    {
      intent: 'status',
      patterns: [
        /(?:where|track|status)\s+(?:is|my|the)\s+(?:ride|trip|driver)/i,
        /(?:how\s+(?:long|far))/i,
      ],
    },
    {
      intent: 'help',
      patterns: [/^(?:help|support|agent|human)/i],
    },
    {
      intent: 'menu',
      patterns: [/^(?:menu|start|hi|hello|hey)$/i],
    },
  ];

  // Location extraction patterns (Nigerian context)
  private readonly LOCATION_PATTERNS = [
    // "from X to Y"
    /(?:from|pickup|at|in)\s+(.+?)\s+(?:to|dest|drop(?:off)?|going)\s+(.+)/i,
    // "to Y from X"
    /(?:to|dest|going)\s+(.+?)\s+(?:from|pickup|at)\s+(.+)/i,
    // "ride from X"
    /(?:ride|take|go)\s+(?:me\s+)?(?:from\s+)?(.+?)(?:\s+to\s+(.+))?$/i,
    // "X to Y" (just addresses)
    /^(.+?)\s+(?:to|->|→)\s+(.+)$/i,
  ];

  // Common Nigerian landmarks for fuzzy matching
  private readonly LANDMARKS: Record<string, string> = {
    'wuse': 'Wuse Market, Abuja',
    'garki': 'Garki, Abuja',
    'maitama': 'Maitama, Abuja',
    'central area': 'Central Area, Abuja',
    'airport': 'Nnamdi Azikiwe International Airport, Abuja',
    'kebbi': 'Kebbi State',
    'suleja': 'Suleja, Niger State',
    'zuba': 'Zuba, Abuja',
    'kubwa': 'Kubwa, Abuja',
    'lugbe': 'Lugbe, Abuja',
    'bwari': 'Bwari, Abuja',
    'jabi': 'Jabi, Abuja',
    'utako': 'Utako, Abuja',
    'gwarinpa': 'Gwarinpa, Abuja',
    'life camp': 'Life Camp, Abuja',
    'ape': 'APE Presidential Villa, Abuja',
  };

  extract(text: string): ExtractedEntities {
    const normalized = text.trim();
    const lower = normalized.toLowerCase();

    // 1. Detect intent
    let intent: ExtractedEntities['intent'] = 'unknown';
    for (const { intent: i, patterns } of this.INTENT_PATTERNS) {
      if (patterns.some((p) => p.test(lower))) {
        intent = i;
        break;
      }
    }

    // 2. Extract locations
    let pickup: string | undefined;
    let destination: string | undefined;

    for (const pattern of this.LOCATION_PATTERNS) {
      const match = normalized.match(pattern);
      if (match) {
        pickup = this.resolveLandmark(match[1]?.trim());
        destination = this.resolveLandmark(match[2]?.trim());
        if (pickup && destination) {
          intent = 'book_ride'; // Override intent if locations found
          break;
        }
      }
    }

    // 3. Extract vehicle type
    let vehicleType: string | undefined;
    if (/keke|keke\s*napep|tricycle|apture/i.test(lower)) vehicleType = 'keke';
    else if (/\bcar\b|sedan|suv/i.test(lower)) vehicleType = 'car';
    else if (/\bbike\b|motorcycle|okada/i.test(lower)) vehicleType = 'bike';

    // 4. Extract payment method
    let paymentMethod: string | undefined;
    if (/\bcash\b/i.test(lower)) paymentMethod = 'cash';
    else if (/\bcard\b|paystack|online/i.test(lower)) paymentMethod = 'card';

    // 5. Extract rating
    let rating: number | undefined;
    const ratingMatch = lower.match(/(\d)\s*(?:star|⭐)/i);
    if (ratingMatch) {
      rating = parseInt(ratingMatch[1], 10);
    }

    return { intent, pickup, destination, vehicleType, paymentMethod, rating };
  }

  private resolveLandmark(input: string | undefined): string | undefined {
    if (!input) return undefined;

    const lower = input.toLowerCase();

    // Exact landmark match
    if (this.LANDMARKS[lower]) {
      return this.LANDMARKS[lower];
    }

    // Partial match
    for (const [key, value] of Object.entries(this.LANDMARKS)) {
      if (lower.includes(key) || key.includes(lower)) {
        return value;
      }
    }

    // Return as-is (Maps will handle it)
    return input;
  }

  /**
   * Check if text looks like a location (not a command).
   */
  isLocationInput(text: string): boolean {
    // If it contains common location indicators
    return /(?:street|road|lane|close|avenue|way|junction|market|estate|phase|district|area)/i.test(text)
      || /\d+/.test(text) // Contains numbers (address-like)
      || text.split(' ').length >= 2; // Multi-word (likely an address)
  }
}
```

### 2. Register in WhatsAppModule

**Modify:** `apps/api/src/whatsapp/whatsapp.module.ts`

Add to providers:
```typescript
providers: [
  // ... existing
  NlpIntentService,
],
```

### 3. Integrate NLP into message routing

**Modify:** `apps/api/src/whatsapp/whatsapp.service.ts`

Add to constructor:
```typescript
private readonly nlp?: NlpIntentService,
```

In `routeMessage`, before the state-based routing:

```typescript
// NLP shortcut — extract intent and entities from free text
if (parsed.text && this.nlp) {
  const extracted = this.nlp.extract(parsed.text);

  // If we found locations, pre-fill booking and skip to vehicle selection
  if (extracted.pickup && extracted.destination && state === ConversationState.IDLE) {
    if (this.orchestrator) {
      const pickupResult = await this.orchestrator.handlePickup(conversation.id, {
        type: 'text', text: extracted.pickup,
      });
      if (pickupResult.state === ConversationState.AWAITING_DESTINATION) {
        return this.orchestrator.handleDestination(conversation.id, {
          type: 'text', text: extracted.destination,
        });
      }
    }
  }

  // If we found just a pickup and intent is book_ride
  if (extracted.pickup && !extracted.destination && extracted.intent === 'book_ride') {
    if (this.orchestrator) {
      return this.orchestrator.handlePickup(conversation.id, {
        type: 'text', text: extracted.pickup,
      });
    }
  }

  // Route by detected intent
  if (extracted.intent === 'cancel') {
    if (this.orchestrator) {
      return this.orchestrator.cancelBooking(conversation.id);
    }
  }

  if (extracted.intent === 'menu') {
    return this.getMenuResponse(conversation, lang);
  }

  if (extracted.intent === 'help') {
    return {
      state: ConversationState.HUMAN_HANDOFF,
      messages: [{ type: 'text', text: this.t('support_response', lang) }],
    };
  }
}
```

---

## Acceptance Criteria

- [ ] `NlpIntentService` extracts intent from free text
- [ ] Location patterns extract pickup and destination from "from X to Y" format
- [ ] Nigerian landmarks resolved (Wuse, Garki, Airport, etc.)
- [ ] Vehicle type extracted (keke, car, bike)
- [ ] Payment method extracted (cash, card)
- [ ] NLP integrated into `routeMessage` — shortcuts booking flow
- [ ] "from Wuse to Airport" → extracts both → jumps to fare confirmation
- [ ] Fallback to menu when NLP can't extract useful info
- [ ] `pnpm build api` compiles without errors

---

## Verification

```bash
cd apps/api
pnpm build
# Verify: "from Wuse to Airport" → extracts pickup + destination
# Verify: "book keke to Garki" → extracts vehicle + destination
# Verify: "cancel ride" → extracts cancel intent
# Verify: "help" → extracts help intent
```
