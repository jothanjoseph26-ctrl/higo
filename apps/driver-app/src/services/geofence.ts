import { LatLng, Zone, ZoneType } from '@higo/shared-types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';

const ZONES_CACHE_KEY = '@higo/driver/active_zones';

export interface CachedZones {
  zones: Zone[];
  updatedAt: number;
}

export function isPointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  const x = point.lng;
  const y = point.lat;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export async function fetchAndCacheZones(): Promise<Zone[]> {
  try {
    const zones = await api.request<Zone[]>({
      method: 'GET',
      url: '/zones',
    });
    const cacheData: CachedZones = {
      zones,
      updatedAt: Date.now(),
    };
    await AsyncStorage.setItem(ZONES_CACHE_KEY, JSON.stringify(cacheData));
    return zones;
  } catch (err) {
    console.error('Failed to fetch zones, returning cached if available', err);
    return getCachedZones();
  }
}

export async function getCachedZones(): Promise<Zone[]> {
  const raw = await AsyncStorage.getItem(ZONES_CACHE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as CachedZones;
    return parsed.zones;
  } catch {
    return [];
  }
}

export async function checkRestrictedGeofence(point: LatLng): Promise<Zone | null> {
  const zones = await getCachedZones();
  for (const zone of zones) {
    if (zone.zoneType === ZoneType.RESTRICTED && zone.isActive) {
      if (isPointInPolygon(point, zone.boundary)) {
        return zone;
      }
    }
  }
  return null;
}
