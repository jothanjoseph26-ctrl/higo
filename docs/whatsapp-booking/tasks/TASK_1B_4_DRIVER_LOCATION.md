# Task 1B-4: Driver Location Tracking

**Agent:** Agent E
**Phase:** 1B — Driver WhatsApp
**Depends on:** 1B-2 (Driver Handler)
**Blocks:** None
**Effort:** 0.5 days

---

## Context

Since WhatsApp Business API does NOT support Live Location, driver location tracking works differently:
1. Driver shares a static location pin → webhook receives lat/lng → update Redis geo index
2. For Phase 1B, this is sufficient — drivers who want real-time GPS tracking should use the mobile app

---

## Exact Changes

### 1. Update Redis with driver location on pin share

**Modify:** `apps/api/src/whatsapp/whatsapp.service.ts`

In `handleDriverOnline` when location is received:
```typescript
if (parsed.type === 'location' && parsed.location) {
  // Update Redis geo index for dispatch
  const locationData = JSON.stringify({
    lat: parsed.location.lat,
    lng: parsed.location.lng,
    bearing: 0,
    speed: 0,
    recordedAt: new Date().toISOString(),
  });

  await this.redis.set(`loc:driver:${conversation.driverId}`, locationData, 600);
  // Also add to geo set for spatial queries
  await this.redis.raw.geoadd(
    'drivers:online',
    parsed.location.lng,
    parsed.location.lat,
    conversation.driverId,
  );

  return {
    state: ConversationState.DRIVER_ONLINE,
    messages: [{ type: 'text', text: `📍 Location updated! Waiting for ride requests...` }],
  };
}
```

### 2. Add Redis import to WhatsApp service

**Modify:** `apps/api/src/whatsapp/whatsapp.service.ts`

Add to constructor:
```typescript
private readonly redis?: RedisService,
```

**Modify:** `apps/api/src/whatsapp/whatsapp.module.ts`

Ensure `RedisModule` is imported (already done in Task 1A-7).

---

## Acceptance Criteria

- [ ] Driver location pin updates Redis `loc:driver:{id}` key
- [ ] Driver location added to `drivers:online` geo set
- [ ] Redis key has 600-second TTL
- [ ] Location update message sent back to driver
- [ ] `pnpm build api` compiles without errors

---

## Verification

```bash
cd apps/api
pnpm build
# Verify: Redis geo operations compile
# Verify: location update flow works
```
