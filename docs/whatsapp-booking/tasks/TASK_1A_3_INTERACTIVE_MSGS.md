# Task 1A-3: WhatsApp Interactive Messages (Buttons + Lists)

**Agent:** Agent C
**Phase:** 1A — Foundation
**Depends on:** None
**Blocks:** 1A-6 (Booking Orchestrator), 1A-8 (Passenger Flow)
**Effort:** 1 day

---

## Context

The entire WhatsApp UX depends on quick-reply buttons and list menus. Currently `sendMessage` at `whatsapp.service.ts:590` only sends plain text. This task adds support for interactive button messages, list messages, and location messages — the three message types the booking flow needs.

WhatsApp constraints:
- Buttons: max 3 quick replies per message
- Lists: up to 10 sections, each with rows
- Location: lat/lng with optional name/address

---

## Exact Changes

### 1. Update WhatsAppMessagePayload type to include location

**Modify:** `apps/api/src/whatsapp/whatsapp.types.ts`

In the `messages` array type (around line 88), add after `audio`:
```typescript
location?: {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
  url?: string;
};
```

Also add `context` field to messages:
```typescript
context?: {
  from: string;
  id: string;
};
```

### 2. Add helper types

**Modify:** `apps/api/src/whatsapp/whatsapp.types.ts`

Add at the end of the file:
```typescript
export interface WhatsAppButton {
  id: string;
  title: string;
}

export interface WhatsAppListRow {
  id: string;
  title: string;
  description?: string;
}

export interface WhatsAppListSection {
  title: string;
  rows: WhatsAppListRow[];
}

export interface ParsedInboundMessage {
  type: 'text' | 'location' | 'interactive' | 'unknown';
  text?: string;
  location?: {
    lat: number;
    lng: number;
    address?: string;
    name?: string;
  };
  buttonId?: string;
  buttonTitle?: string;
  listRowId?: string;
  listRowTitle?: string;
  messageId: string;
  timestamp: string;
}
```

### 3. Update extractTextContent to handle all message types

**Modify:** `apps/api/src/whatsapp/whatsapp.service.ts`

Replace the `extractTextContent` method (lines 243-258) with a new `parseInboundMessage` method:

```typescript
private parseInboundMessage(
  msg: WhatsAppMessagePayload['entry'][0]['changes'][0]['value']['messages'][0],
): ParsedInboundMessage {
  const base = { messageId: msg.id, timestamp: msg.timestamp };

  if (msg.type === 'text' && msg.text?.body) {
    return { ...base, type: 'text', text: msg.text.body.trim() };
  }

  if (msg.type === 'location' && msg.location) {
    return {
      ...base,
      type: 'location',
      location: {
        lat: msg.location.latitude,
        lng: msg.location.longitude,
        address: msg.location.address,
        name: msg.location.name,
      },
    };
  }

  if (msg.type === 'interactive') {
    if (msg.interactive?.button_reply) {
      return {
        ...base,
        type: 'interactive',
        text: msg.interactive.button_reply.title.trim(),
        buttonId: msg.interactive.button_reply.id,
        buttonTitle: msg.interactive.button_reply.title.trim(),
      };
    }
    if (msg.interactive?.list_reply) {
      return {
        ...base,
        type: 'interactive',
        text: msg.interactive.list_reply.title.trim(),
        listRowId: msg.interactive.list_reply.id,
        listRowTitle: msg.interactive.list_reply.title.trim(),
      };
    }
  }

  return { ...base, type: 'unknown' };
}
```

### 4. Add button message sending

**Modify:** `apps/api/src/whatsapp/whatsapp.service.ts`

Add new method after `sendMessage`:

```typescript
async sendButtonsMessage(
  phoneNumberId: string,
  to: string,
  text: string,
  buttons: WhatsAppButton[],
  accessToken: string,
): Promise<SendResult> {
  if (!text || !buttons.length) {
    return { success: true };
  }

  const truncated = text.length > MESSAGE_LENGTH_LIMIT
    ? text.slice(0, MESSAGE_LENGTH_LIMIT - 3) + '...'
    : text;

  // WhatsApp limits buttons to 3
  const limitedButtons = buttons.slice(0, 3);

  const maxAttempts = this.circuitBreaker.state === 'open' ? 1 : MAX_RETRY_ATTEMPTS;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`${META_GRAPH_URL}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: { text: truncated },
            action: {
              buttons: limitedButtons.map((b) => ({
                type: 'reply',
                reply: { id: b.id, title: b.title },
              })),
            },
          },
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        this.logger.error(`Meta API error ${response.status}:`, errorBody);

        if (this.isRetryableError(response.status) && attempt < maxAttempts) {
          await this.delay(Math.pow(2, attempt) * 500);
          continue;
        }

        // Fallback to text message with numbered options
        return this.sendMessage(phoneNumberId, to, truncated, accessToken);
      }

      const result = await response.json();
      this.recordSuccess();
      return { success: true, messageId: result?.messages?.[0]?.id };
    } catch (error) {
      this.logger.error(`Network error sending buttons (attempt ${attempt}):`, error.message);
      if (attempt < maxAttempts) {
        await this.delay(Math.pow(2, attempt) * 500);
        continue;
      }
      return this.sendMessage(phoneNumberId, to, truncated, accessToken);
    }
  }

  return { success: false, error: 'Max retries exceeded', errorType: ErrorType.TEMPORARY_FAILURE };
}
```

### 5. Add list message sending

**Modify:** `apps/api/src/whatsapp/whatsapp.service.ts`

Add new method after `sendButtonsMessage`:

```typescript
async sendListMessage(
  phoneNumberId: string,
  to: string,
  title: string,
  description: string,
  buttonText: string,
  sections: WhatsAppListSection[],
  accessToken: string,
): Promise<SendResult> {
  if (!title || !sections.length) {
    return { success: true };
  }

  const maxAttempts = this.circuitBreaker.state === 'open' ? 1 : MAX_RETRY_ATTEMPTS;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`${META_GRAPH_URL}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'interactive',
          interactive: {
            type: 'list',
            header: { type: 'text', text: title },
            body: { text: description },
            action: {
              button: buttonText,
              sections: sections.map((s) => ({
                title: s.title,
                rows: s.rows.map((r) => ({
                  id: r.id,
                  title: r.title,
                  ...(r.description ? { description: r.description } : {}),
                })),
              })),
            },
          },
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        this.logger.error(`Meta API list error ${response.status}:`, errorBody);

        if (this.isRetryableError(response.status) && attempt < maxAttempts) {
          await this.delay(Math.pow(2, attempt) * 500);
          continue;
        }

        // Fallback: flatten list to text
        const fallbackText = `${title}\n\n${description}\n\n` +
          sections.flatMap((s) =>
            s.rows.map((r, i) => `${i + 1}. ${r.title}${r.description ? ` - ${r.description}` : ''}`)
          ).join('\n');
        return this.sendMessage(phoneNumberId, to, fallbackText, accessToken);
      }

      const result = await response.json();
      this.recordSuccess();
      return { success: true, messageId: result?.messages?.[0]?.id };
    } catch (error) {
      this.logger.error(`Network error sending list (attempt ${attempt}):`, error.message);
      if (attempt < maxAttempts) {
        await this.delay(Math.pow(2, attempt) * 500);
        continue;
      }
      return { success: false, error: error.message, errorType: ErrorType.NETWORK_TIMEOUT };
    }
  }

  return { success: false, error: 'Max retries exceeded', errorType: ErrorType.TEMPORARY_FAILURE };
}
```

### 6. Add location message sending

**Modify:** `apps/api/src/whatsapp/whatsapp.service.ts`

Add new method after `sendListMessage`:

```typescript
async sendLocationMessage(
  phoneNumberId: string,
  to: string,
  lat: number,
  lng: number,
  name: string,
  address: string,
  accessToken: string,
): Promise<SendResult> {
  const maxAttempts = this.circuitBreaker.state === 'open' ? 1 : MAX_RETRY_ATTEMPTS;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`${META_GRAPH_URL}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'location',
          location: {
            latitude: lat,
            longitude: lng,
            name,
            address,
          },
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        this.logger.error(`Meta API location error ${response.status}:`, errorBody);
        if (this.isRetryableError(response.status) && attempt < maxAttempts) {
          await this.delay(Math.pow(2, attempt) * 500);
          continue;
        }
        return { success: false, error: errorBody?.error?.message, errorType: this.classifyHttpError(response.status) };
      }

      const result = await response.json();
      this.recordSuccess();
      return { success: true, messageId: result?.messages?.[0]?.id };
    } catch (error) {
      this.logger.error(`Network error sending location:`, error.message);
      if (attempt < maxAttempts) {
        await this.delay(Math.pow(2, attempt) * 500);
        continue;
      }
      return { success: false, error: error.message, errorType: ErrorType.NETWORK_TIMEOUT };
    }
  }

  return { success: false, error: 'Max retries exceeded', errorType: ErrorType.TEMPORARY_FAILURE };
}
```

### 7. Update processIncomingMessage to use new parser

**Modify:** `apps/api/src/whatsapp/whatsapp.service.ts`

In `processIncomingMessage` (line 150), replace the call to `extractTextContent` (line 170):

Change:
```typescript
const textContent = this.extractTextContent(msg);
if (!textContent) {
  this.logger.debug(`Ignoring non-text message from ${msg.from}: ${msg.type}`);
  return;
}
```

To:
```typescript
const parsed = this.parseInboundMessage(msg);
if (parsed.type === 'unknown') {
  this.logger.debug(`Ignoring unsupported message type from ${msg.from}: ${msg.type}`);
  return;
}

const textContent = parsed.text || parsed.location
  ? (parsed.text || JSON.stringify(parsed.location))
  : null;

if (!textContent) {
  this.logger.debug(`Ignoring non-text message from ${msg.from}: ${msg.type}`);
  return;
}
```

---

## Acceptance Criteria

- [ ] `WhatsAppMessagePayload` type includes `location` and `context` fields
- [ ] `ParsedInboundMessage` interface exported from `whatsapp.types.ts`
- [ ] `parseInboundMessage` handles text, location, interactive (button/list), and unknown types
- [ ] `sendButtonsMessage` sends interactive button messages with max 3 buttons
- [ ] `sendListMessage` sends interactive list messages with sections/rows
- [ ] `sendLocationMessage` sends location pin messages
- [ ] All three send methods have retry logic and text fallback on failure
- [ ] `processIncomingMessage` uses `parseInboundMessage` instead of `extractTextContent`
- [ ] `pnpm build api` compiles without errors

---

## Verification

```bash
cd apps/api
pnpm build
# Should compile. Manual testing with WhatsApp Business API sandbox needed for send methods.
```
