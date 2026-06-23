import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTripStore } from '../../stores/tripStore';
import { Button } from '../../components/Button';
import { ScreenShell } from '../../components/ScreenShell';
import { theme } from '../../theme';
import type { DriverMainStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<DriverMainStackParamList, 'TripComplete'>;

export function TripComplete({ navigation }: Props) {
  const { activeTrip, setActiveTrip } = useTripStore();

  const handleNext = () => {
    if (activeTrip) {
      const tripId = activeTrip.id;
      // We clear activeTrip, but keep the ID to rate passenger
      setActiveTrip(null);
      navigation.navigate('RatePassenger', { tripId });
    } else {
      navigation.navigate('Tab');
    }
  };

  const fareNaira = activeTrip ? (activeTrip.totalFare / 100).toFixed(2) : '0.00';

  return (
    <ScreenShell title="Trip Completed!" subtitle="Ride finished successfully">
      <View style={styles.card}>
        <Text style={styles.summaryTitle}>Earnings Summary</Text>
        <Text style={styles.fare}>NGN {fareNaira}</Text>

        <View style={styles.divider} />

        <View style={styles.row}>
          <Text style={styles.label}>Pickup</Text>
          <Text style={styles.val}>{activeTrip?.pickupAddress || '—'}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Destination</Text>
          <Text style={styles.val}>{activeTrip?.destinationAddress || '—'}</Text>
        </View>
      </View>

      <Button label="Rate Passenger" onPress={handleNext} />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    alignItems: 'center',
    ...theme.shadow.sm,
  },
  summaryTitle: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '600',
    marginBottom: theme.spacing.xs,
  },
  fare: {
    fontSize: 32,
    fontWeight: '700',
    color: theme.colors.primaryGreen,
    marginVertical: theme.spacing.sm,
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: theme.spacing.md,
  },
  row: {
    width: '100%',
    marginBottom: theme.spacing.sm,
  },
  label: {
    fontSize: 11,
    color: '#9CA3AF',
    textTransform: 'uppercase',
  },
  val: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.darkNavy,
    marginTop: 2,
  },
});
