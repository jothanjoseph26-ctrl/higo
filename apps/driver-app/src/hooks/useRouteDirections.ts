import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import type { LatLng } from '@higo/shared-types';
import { api } from '../services/api';

function isMapsMock(): boolean {
  if (Platform.OS === 'web') return true;
  return process.env.EXPO_PUBLIC_MAPS_MOCK === 'true';
}

function straightLine(origin: LatLng, destination: LatLng): LatLng[] {
  return [origin, destination];
}

function coordsKey(point: LatLng | null | undefined): string {
  if (!point) return '';
  return `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
}

export function useRouteDirections(
  origin: LatLng | null | undefined,
  destination: LatLng | null | undefined,
): LatLng[] | undefined {
  const [routePolyline, setRoutePolyline] = useState<LatLng[] | undefined>();

  useEffect(() => {
    if (!origin || !destination) {
      setRoutePolyline(undefined);
      return;
    }

    if (isMapsMock()) {
      setRoutePolyline(straightLine(origin, destination));
      return;
    }

    let cancelled = false;

    void api
      .getDirections(origin, destination)
      .then((result) => {
        if (!cancelled) {
          setRoutePolyline(
            result.polyline.length >= 2
              ? result.polyline
              : straightLine(origin, destination),
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRoutePolyline(straightLine(origin, destination));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [coordsKey(origin), coordsKey(destination)]);

  return routePolyline;
}