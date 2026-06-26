import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { LatLng } from '@higo/shared-types';
import { useTripStore } from '../../stores/tripStore';
import { Button } from '../../components/Button';
import { MapView } from '../../components/MapView';
import { useRouteDirections } from '../../hooks/useRouteDirections';
import { ScreenShell } from '../../components/ScreenShell';
import { theme } from '../../theme';
import type { DriverMainStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<DriverMainStackParamList, 'Navigation'>;

export function Navigation({ navigation }: Props) {
  const { activeTrip, arriveAtPickup } = useTripStore();
  const [driverLocation, setDriverLocation] = useState<LatLng | null>(null);
  const [driverBearing, setDriverBearing] = useState(0);
  const routePolyline = useRouteDirections(
    driverLocation,
    activeTrip?.pickupLocation ?? null,
  );

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;

    void (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 5,
          timeInterval: 3000,
        },
        (loc) => {
          setDriverLocation({
            lat: loc.coords.latitude,
            lng: loc.coords.longitude,
          });
          setDriverBearing(loc.coords.heading ?? 0);
        }
      );
    })();

    return () => {
      subscription?.remove();
    };
  }, []);

  const handleArrived = async () => {
    if (activeTrip) {
      await arriveAtPickup(activeTrip.id);
      navigation.navigate('TripActive');
    }
  };

  if (!activeTrip) {
    return (
      <ScreenShell title="Navigation" subtitle="No active trip">
        <Button label="Go Home" onPress={() => navigation.navigate('Tab')} />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      title="Navigating to Pickup"
      subtitle="Head towards the pickup location"
      scroll={false}
      contentStyle={styles.shell}
    >
      <View style={styles.mapContainer}>
        <MapView
          pickup={activeTrip.pickupLocation}
          driverLocation={driverLocation}
          driverBearing={driverBearing}
          routePolyline={routePolyline}
          style={styles.map}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Pickup Address</Text>
        <Text style={styles.address}>{activeTrip.pickupAddress}</Text>

        <Text style={styles.label}>Passenger</Text>
        <Text style={styles.info}>Waiting for you at pickup point</Text>
      </View>

      <Button label="I Have Arrived" onPress={handleArrived} style={styles.btn} />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    padding: theme.spacing.lg,
  },
  mapContainer: {
    height: 250,
    borderRadius: theme.radius.card,
    overflow: 'hidden',
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadow.sm,
  },
  label: {
    fontSize: 12,
    color: '#9CA3AF',
    textTransform: 'uppercase',
  },
  address: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.darkNavy,
    marginBottom: theme.spacing.sm,
  },
  info: {
    fontSize: 14,
    color: '#4B5563',
  },
  btn: {
    backgroundColor: theme.colors.accentOrange,
  },
});