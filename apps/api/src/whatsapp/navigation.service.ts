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
