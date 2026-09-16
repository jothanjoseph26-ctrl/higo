# Task 1A-10: Navigation + Location Handling

**Agent:** Agent C
**Phase:** 1A — Foundation
**Depends on:** 1A-3 (Interactive Messages)
**Blocks:** 1A-8 (Passenger Flow needs location parsing)
**Effort:** 0.5 days

---

## Context

Two key features:
1. **Google Maps navigation URLs** — like inDrive, open Google Maps with pickup → destination for driver navigation
2. **WhatsApp location message parsing** — extract lat/lng from location pin drops

This task creates reusable helpers for both.

---

## Exact Changes

### 1. Create navigation URL builder

**New file:** `apps/api/src/whatsapp/navigation.service.ts`

```typescript
import { Injectable } from '@nestjs/common';

@Injectable()
export class NavigationService {
  /**
   * Build Google Maps navigation URL for driver to navigate to pickup.
   * Origin is omitted — Google Maps uses driver's current GPS.
   */
  toPickup(pickupLat: number, pickupLng: number): string {
    const dest = `${pickupLat}%2C${pickupLng}`;
    return `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving&dir_action=navigate`;
  }

  /**
   * Build Google Maps navigation URL for driver to navigate to destination.
   * Origin is omitted — Google Maps uses driver's current GPS.
   */
  toDestination(destLat: number, destLng: number): string {
    const dest = `${destLat}%2C${destLng}`;
    return `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving&dir_action=navigate`;
  }

  /**
   * Build Google Maps URL showing full route from pickup to destination.
   * Used for passenger to see the route.
   */
  fullRoute(
    pickupLat: number, pickupLng: number,
    destLat: number, destLng: number,
  ): string {
    const origin = `${pickupLat}%2C${pickupLng}`;
    const dest = `${destLat}%2C${destLng}`;
    return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=driving`;
  }

  /**
   * Build Google Maps location pin URL (view-only, no navigation).
   */
  locationPin(lat: number, lng: number, label?: string): string {
    const query = label ? `${lat}%2C${lng}(${encodeURIComponent(label)})` : `${lat}%2C${lng}`;
    return `https://www.google.com/maps/search/?api=1&query=${query}`;
  }

  /**
   * Build Google Maps search URL for an address string.
   */
  searchAddress(address: string): string {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  }

  /**
   * Format a trip summary message with navigation links.
   */
  tripSummaryWithNav(params: {
    pickupAddress: string;
    pickupLat: number;
    pickupLng: number;
    destAddress: string;
    destLat: number;
    destLng: number;
    fare: number;
    vehicleType: string;
    passengerName?: string;
  }): string {
    const emoji = params.vehicleType === 'keke' ? '🛺' : params.vehicleType === 'car' ? '🚗' : '🏍️';
    const navToPickup = this.toPickup(params.pickupLat, params.pickupLng);
    const navToDest = this.toDestination(params.destLat, params.destLng);

    return [
      `${emoji} New Ride Request`,
      '',
      `📍 Pickup: ${params.pickupAddress}`,
      `🏁 Destination: ${params.destAddress}`,
      `💰 Fare: ₦${params.fare.toLocaleString()}`,
      params.passengerName ? `👤 Passenger: ${params.passengerName}` : '',
      '',
      `🗺️ Navigate to pickup:`,
      navToPickup,
      '',
      `🗺️ Navigate to destination (after pickup):`,
      navToDest,
    ].filter(Boolean).join('\n');
  }
}
```

### 2. Register in WhatsAppModule

**Modify:** `apps/api/src/whatsapp/whatsapp.module.ts`

Add to providers and exports:
```typescript
providers: [
  WhatsAppService,
  BookingOrchestrator,
  IdempotencyService,
  WhatsAppNotificationListener,
  NavigationService,
],
exports: [WhatsAppService, BookingOrchestrator, IdempotencyService, NavigationService],
```

Add import:
```typescript
import { NavigationService } from './navigation.service';
```

### 3. Use NavigationService in NotificationListener

**Modify:** `apps/api/src/whatsapp/notification.listener.ts`

Add to constructor:
```typescript
private readonly navigationService: NavigationService,
```

In `handleDriverMatched`, build the navigation-rich message:
```typescript
// Get trip details for navigation links
const trip = await this.prisma.trip.findUnique({ where: { id: event.tripId } });
if (trip) {
  const pickupGeo = JSON.parse(trip.pickupLocationGeoJson || '{}');
  const destGeo = JSON.parse(trip.destinationLocationGeoJson || '{}');
  const pickup = { lat: pickupGeo.coordinates?.[1], lng: pickupGeo.coordinates?.[0] };
  const dest = { lat: destGeo.coordinates?.[1], lng: destGeo.coordinates?.[0] };

  if (pickup.lat && dest.lat) {
    const navMessage = this.navigationService.tripSummaryWithNav({
      pickupAddress: trip.pickupAddress,
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
      destAddress: trip.destinationAddress,
      destLat: dest.lat,
      destLng: dest.lng,
      fare: event.etaMinutes || 0,
      vehicleType: trip.vehicleType,
      passengerName: event.driverName,
    });

    await this.whatsappService.sendMessage(
      await this.getPhoneNumberId(),
      driverConversation.whatsappPhone,
      navMessage,
      await this.getAccessToken(),
    );
  }
}
```

### 4. Update WhatsApp types for location parsing

**Verify:** The `location` field was already added to `WhatsAppMessagePayload` in Task 1A-3.

**Modify:** `apps/api/src/whatsapp/whatsapp.types.ts`

Ensure `ParsedInboundMessage` includes location (already done in 1A-3):
```typescript
export interface ParsedInboundMessage {
  type: 'text' | 'location' | 'interactive' | 'unknown';
  text?: string;
  location?: {
    lat: number;
    lng: number;
    address?: string;
    name?: string;
  };
  // ... other fields
}
```

---

## Acceptance Criteria

- [ ] `NavigationService` creates correct Google Maps URLs for:
  - Navigate to pickup (no origin — uses driver GPS)
  - Navigate to destination (no origin — uses driver GPS)
  - Full route view (pickup → destination)
  - Location pin (view-only)
  - Address search
- [ ] URLs use `google.com/maps/dir/?api=1` format (cross-platform)
- [ ] `tripSummaryWithNav` formats a message with pickup + destination nav links
- [ ] `NavigationService` registered in WhatsAppModule
- [ ] `NotificationListener` uses `NavigationService` for driver match messages
- [ ] Location messages parsed correctly (lat/lng/address/name extracted)
- [ ] `pnpm build api` compiles without errors

---

## Verification

```bash
cd apps/api
pnpm build
# Verify URL format: https://www.google.com/maps/dir/?api=1&destination=9.0579%2C7.4951&travelmode=driving&dir_action=navigate
```
