import React from 'react';
import { StyleSheet, Text, View, Platform } from 'react-native';
import { theme } from '../theme';
import type { LatLng } from '@higo/shared-types';
import NativeMapView, { Marker, Polyline } from 'react-native-maps';

interface MapViewProps {
  pickup?: LatLng | null;
  destination?: LatLng | null;
  driverLocation?: LatLng | null;
  driverBearing?: number;
  routePolyline?: LatLng[];
  style?: object;
}

function useMapsMock(): boolean {
  if (Platform.OS === 'web') return true;
  return process.env.EXPO_PUBLIC_MAPS_MOCK === 'true';
}

function toMapCoords(points: LatLng[]) {
  return points.map((point) => ({
    latitude: point.lat,
    longitude: point.lng,
  }));
}

export function MapView({
  pickup,
  destination,
  driverLocation,
  driverBearing = 0,
  routePolyline,
  style,
}: MapViewProps) {
  const isMock = useMapsMock();
  const hasTripRoute = Boolean(pickup && destination);
  const hasDriverRoute = Boolean(driverLocation && pickup && !hasTripRoute);

  if (isMock) {
    return (
      <View style={[styles.container, styles.mockMap, style]}>
        <View style={styles.mockMapContent}>
          <Text style={styles.mockMapTitle}>🗺️ Driver Navigation Map</Text>
          {driverLocation && (
            <Text style={styles.mockMarkerText}>
              🛺 You: {driverLocation.lat.toFixed(4)}, {driverLocation.lng.toFixed(4)} (bearing:{' '}
              {driverBearing}°)
            </Text>
          )}
          {pickup && (
            <Text style={styles.mockMarkerText}>
              🟢 Pickup: {pickup.lat.toFixed(4)}, {pickup.lng.toFixed(4)}
            </Text>
          )}
          {destination && (
            <Text style={styles.mockMarkerText}>
              🔴 Destination: {destination.lat.toFixed(4)}, {destination.lng.toFixed(4)}
            </Text>
          )}
          {routePolyline && routePolyline.length >= 2 && (
            <Text style={styles.mockMarkerText}>
              Route points: {routePolyline.length}
            </Text>
          )}
        </View>
      </View>
    );
  }

  const center = driverLocation ?? pickup ?? { lat: 9.0765, lng: 7.3986 };
  const initialRegion = {
    latitude: center.lat,
    longitude: center.lng,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  const tripRouteCoords =
    routePolyline && routePolyline.length >= 2
      ? toMapCoords(routePolyline)
      : pickup && destination
        ? toMapCoords([pickup, destination])
        : [];

  const driverRouteCoords =
    routePolyline && routePolyline.length >= 2
      ? toMapCoords(routePolyline)
      : driverLocation && pickup
        ? toMapCoords([driverLocation, pickup])
        : [];

  return (
    <NativeMapView
      style={[styles.container, style]}
      initialRegion={initialRegion}
      showsUserLocation
      showsMyLocationButton={false}
    >
      {pickup && (
        <Marker
          coordinate={{ latitude: pickup.lat, longitude: pickup.lng }}
          title="Pickup Location"
          pinColor="green"
        />
      )}

      {destination && (
        <Marker
          coordinate={{ latitude: destination.lat, longitude: destination.lng }}
          title="Destination"
          pinColor="red"
        />
      )}

      {driverLocation && (
        <Marker
          coordinate={{ latitude: driverLocation.lat, longitude: driverLocation.lng }}
          title="Your Location"
          rotation={driverBearing}
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <View style={styles.kekeMarkerContainer}>
            <Text style={styles.kekeEmoji}>🛺</Text>
          </View>
        </Marker>
      )}

      {hasTripRoute && tripRouteCoords.length >= 2 && (
        <Polyline
          coordinates={tripRouteCoords}
          strokeColor={theme.colors.primaryGreen}
          strokeWidth={4}
        />
      )}

      {hasDriverRoute && driverRouteCoords.length >= 2 && (
        <Polyline
          coordinates={driverRouteCoords}
          strokeColor={theme.colors.accentOrange}
          strokeWidth={3}
          lineDashPattern={[5, 5]}
        />
      )}
    </NativeMapView>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
  mockMap: {
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  mockMapContent: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    width: '100%',
    maxWidth: 320,
    shadowColor: theme.colors.darkNavy,
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  mockMapTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.darkNavy,
    marginBottom: theme.spacing.md,
    textAlign: 'center',
  },
  mockMarkerText: {
    fontSize: 13,
    color: theme.colors.dark,
    marginVertical: theme.spacing.xs,
  },
  kekeMarkerContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 6,
    borderWidth: 2,
    borderColor: theme.colors.accentOrange,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  kekeEmoji: {
    fontSize: 18,
  },
});