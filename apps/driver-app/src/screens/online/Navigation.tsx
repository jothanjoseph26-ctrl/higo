import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTripStore } from '../../stores/tripStore';
import { Button } from '../../components/Button';
import { ScreenShell } from '../../components/ScreenShell';
import { theme } from '../../theme';
import type { DriverMainStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<DriverMainStackParamList, 'Navigation'>;

export function Navigation({ navigation }: Props) {
  const { activeTrip, arriveAtPickup } = useTripStore();

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
    <ScreenShell title="Navigating to Pickup" subtitle="Head towards the pickup location">
      <View style={styles.mapMock}>
        <Text style={styles.mapText}>[ Map View Showing Route to Pickup ]</Text>
        <Text style={styles.gpsCoords}>
          Target: {activeTrip.pickupLocation?.lat?.toFixed(5)}, {activeTrip.pickupLocation?.lng?.toFixed(5)}
        </Text>
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
  mapMock: {
    height: 250,
    backgroundColor: '#E5E7EB',
    borderRadius: theme.radius.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  mapText: {
    color: '#4B5563',
    fontWeight: '600',
    fontSize: 16,
  },
  gpsCoords: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
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
