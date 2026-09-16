# Task 3-1: Session Recovery + Global Commands

**Agent:** Agent G
**Phase:** 3 — Error Handling
**Depends on:** Phase 1A complete
**Blocks:** None
**Effort:** 2 days

---

## Context

Users go quiet mid-booking, type unexpected input, or return after hours. This task handles session recovery, global commands available in every state, graceful error handling, and stale session cleanup.

---

## Exact Changes

### 1. Session recovery on return

**Modify:** `apps/api/src/whatsapp/whatsapp.service.ts`

In `processIncomingMessage`, before routing:

```typescript
// Session recovery check
const state = conversation.conversationState as ConversationState;
const booking = conversation.activeBooking as ActiveBooking | null;

if (conversation.sessionExpiresAt && conversation.sessionExpiresAt < new Date()) {
  // Session expired — offer recovery
  if (booking && booking.pickup && booking.destination) {
    await this.sendButtonsMessage(
      config.phoneNumberId, msg.from,
      `⏰ Your booking session expired.\n\n📍 ${booking.pickup.address}\n🏁 ${booking.destination.address}\n💰 ₦${booking.fareEstimate?.totalFare || 'TBD'}`,
      [
        { id: 'continue_booking', title: '▶️ Continue' },
        { id: 'start_over', title: '🔄 Start Over' },
      ],
      config.accessToken,
    );
    return;
  }

  // No recoverable data — reset
  await this.prisma.whatsAppConversation.update({
    where: { id: conversation.id },
    data: { conversationState: 'idle', activeBooking: null, activeTripId: null, sessionExpiresAt: null },
  });
}
```

### 2. Global commands handler

**Modify:** `apps/api/src/whatsapp/whatsapp.service.ts`

Add a global command check at the top of `routeMessage`:

```typescript
// Global commands — available in EVERY state
if (parsed.text) {
  const lower = parsed.text.toLowerCase().trim();

  // Menu
  if (['menu', 'start', 'hi', 'hello', 'hey'].includes(lower)) {
    await this.prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: { conversationState: 'idle', activeBooking: null, activeTripId: null },
    });
    return this.getMenuResponse(conversation, lang);
  }

  // Help
  if (['help', 'support', 'agent'].includes(lower)) {
    return {
      state: ConversationState.HUMAN_HANDOFF,
      messages: [{ type: 'text', text: this.t('support_response', lang) }],
    };
  }

  // Cancel
  if (lower === 'cancel') {
    if (this.orchestrator) {
      return this.orchestrator.cancelBooking(conversation.id, 'User cancelled via menu');
    }
  }

  // Back
  if (lower === 'back') {
    return this.handleBack(conversation);
  }

  // Restart
  if (lower === 'restart') {
    await this.prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: { conversationState: 'idle', activeBooking: null, activeTripId: null, sessionExpiresAt: null },
    });
    return this.getMenuResponse(conversation, lang);
  }
}
```

### 3. Back navigation

**Modify:** `apps/api/src/whatsapp/whatsapp.service.ts`

Add method:
```typescript
private handleBack(conversation: { id: string; conversationState: string }): BookingResponse {
  const state = conversation.conversationState as ConversationState;

  // Map each state to its "previous" state
  const backMap: Partial<Record<ConversationState, ConversationState>> = {
    [ConversationState.AWAITING_DESTINATION]: ConversationState.AWAITING_PICKUP,
    [ConversationState.SELECTING_VEHICLE]: ConversationState.AWAITING_DESTINATION,
    [ConversationState.CONFIRMING_RIDE]: ConversationState.SELECTING_VEHICLE,
    [ConversationState.SELECTING_PAYMENT]: ConversationState.CONFIRMING_RIDE,
  };

  const prevState = backMap[state];
  if (prevState) {
    return {
      state: prevState,
      messages: [{
        type: 'buttons',
        text: 'Going back...',
        buttons: [
          { id: 'share_location', title: '📍 Share Location' },
          { id: 'enter_address', title: '✏️ Enter Address' },
        ],
      }],
    };
  }

  // Default: go to menu
  return {
    state: ConversationState.IDLE,
    messages: [{ type: 'text', text: 'Type "menu" to start over.' }],
  };
}
```

### 4. Unexpected input handling

**Modify:** `apps/api/src/whatsapp/whatsapp.service.ts`

In each state handler, add a fallback for unexpected input:

```typescript
// At the end of each handler, before return:
// If we got here, the input was unexpected for this state
return {
  state: state, // Stay in same state
  messages: [{
    type: 'buttons',
    text: `I didn't understand that. Please use the buttons below.`,
    buttons: [/* state-appropriate buttons */],
  }],
};
```

### 5. Stale session cleanup cron job

**New file:** `apps/api/src/whatsapp/session-cleanup.job.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationState } from './whatsapp.types';

@Injectable()
export class SessionCleanupJob {
  private readonly logger = new Logger(SessionCleanupJob.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async cleanupStaleSessions(): Promise<void> {
    const staleThreshold = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes

    const staleConversations = await this.prisma.whatsAppConversation.findMany({
      where: {
        isActive: true,
        sessionExpiresAt: { lt: new Date() },
        conversationState: {
          notIn: [
            ConversationState.IDLE,
            ConversationState.HUMAN_HANDOFF,
            ConversationState.BOOKING_COMPLETED,
            ConversationState.DRIVER_IDLE,
            ConversationState.TRIP_ACTIVE,
          ],
        },
      },
    });

    if (staleConversations.length === 0) return;

    this.logger.log(`Cleaning up ${staleConversations.length} stale WhatsApp sessions`);

    for (const conv of staleConversations) {
      await this.prisma.whatsAppConversation.update({
        where: { id: conv.id },
        data: {
          conversationState: ConversationState.IDLE,
          activeBooking: null,
          sessionExpiresAt: null,
        },
      });
    }
  }
}
```

Register in WhatsAppModule:
```typescript
providers: [
  // ... existing providers
  SessionCleanupJob,
],
```

---

## Acceptance Criteria

- [ ] Expired sessions show recovery message with continue/start-over buttons
- [ ] Global commands (menu, help, cancel, back, restart) work from any state
- [ ] Back navigation goes to previous state in flow
- [ ] Unexpected input shows helpful message with state-appropriate buttons
- [ ] Stale sessions cleaned up every 5 minutes
- [ ] TRIP_ACTIVE sessions are NOT cleaned up (trip is still ongoing)
- [ ] `pnpm build api` compiles without errors

---

## Verification

```bash
cd apps/api
pnpm build
# Verify: expired session shows recovery prompt
# Verify: "menu" works from any state
# Verify: "back" goes to previous step
# Verify: stale cleanup runs every 5 minutes
```
