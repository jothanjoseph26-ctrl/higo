import React from 'react';
import { StyleSheet, Text, View, Image, ActivityIndicator, Platform } from 'react-native';
import { theme } from '../theme';
import type { LatLng } from '@higo/shared-types';
import NativeMapView, { Marker, Polyline } from 'react-native-maps';

interface MapViewProps {
  pickup?: LatLng | null;
  destination?: LatLng | null;
  driverLocation?: LatLng | null;
  driverBearing?: number;
}

export function MapView({
  pickup,
  destination,
  driverLocation,
  driverBearing = 0,
}: MapViewProps) {
  const isMock = Platform.OS === 'web';

  if (isMock) {
    return (
      <View style={[styles.container, styles.mockMap]}>
        <View style={styles.mockMapContent}>
          <Text style={styles.mockMapTitle}>🗺️ Abuja Live Tracking Map</Text>
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
          {driverLocation && (
            <Text style={styles.mockMarkerText}>
              🛺 Driver (Keke): {driverLocation.lat.toFixed(4)}, {driverLocation.lng.toFixed(4)} (bearing: {driverBearing}°)
            </Text>
          )}
        </View>
      </View>
    );
  }

  // Center on pickup, driver, or default Abuja
  const initialRegion = {
    latitude: pickup?.lat ?? 9.0765,
    longitude: pickup?.lng ?? 7.3986,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  return (
    <NativeMapView
      style={styles.container}
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
          title="Your Driver"
          rotation={driverBearing}
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <View style={styles.kekeMarkerContainer}>
            <Text style={styles.kekeEmoji}>🛺</Text>
          </View>
        </Marker>
      )}

      {pickup && destination && (
        <Polyline
          coordinates={[
            { latitude: pickup.lat, longitude: pickup.lng },
            { latitude: destination.lat, longitude: destination.lng },
          ]}
          strokeColor={theme.colors.primaryGreen}
          strokeWidth={4}
        />
      )}

      {driverLocation && pickup && (
        <Polyline
          coordinates={[
            { latitude: driverLocation.lat, longitude: driverLocation.lng },
            { latitude: pickup.lat, longitude: pickup.lng },
          ]}
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
