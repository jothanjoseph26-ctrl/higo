import React from 'react';
import { StyleSheet, Text, View, Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TripStatus } from '@higo/shared-types';
import { useTripStore } from '../../stores/tripStore';
import { Button } from '../../components/Button';
import { ScreenShell } from '../../components/ScreenShell';
import { theme } from '../../theme';
import type { DriverMainStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<DriverMainStackParamList, 'TripActive'>;

export function TripActive({ navigation }: Props) {
  const { activeTrip, startTrip, completeTrip, triggerSOS, isSOSActive } = useTripStore();

  const handleStart = async () => {
    if (activeTrip) {
      await startTrip(activeTrip.id);
    }
  };

  const handleComplete = async () => {
    if (activeTrip) {
      await completeTrip(activeTrip.id);
      navigation.navigate('TripComplete');
    }
  };

  const handleSOS = () => {
    if (activeTrip) {
      Alert.alert(
        'Trigger Emergency SOS?',
        'This will immediately share your live location with emergency services and contacts.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Trigger',
            style: 'destructive',
            onPress: () => {
              void triggerSOS(activeTrip.id);
              Alert.alert('SOS Triggered', 'Location sharing activated. Stay safe.');
            },
          },
        ]
      );
    }
  };

  if (!activeTrip) {
    return (
      <ScreenShell title="Active Trip" subtitle="No active trip">
        <Button label="Go Home" onPress={() => navigation.navigate('Tab')} />
      </ScreenShell>
    );
  }

  const isEnRoute = activeTrip.status === TripStatus.EN_ROUTE || activeTrip.status === TripStatus.MATCHED;

  return (
    <ScreenShell
      title={isEnRoute ? 'Waiting for Passenger' : 'Ride Active'}
      subtitle={isEnRoute ? 'Verify identity before departure' : 'Proceeding to destination'}
    >
      <View style={styles.mapMock}>
        <Text style={styles.mapText}>
          {isEnRoute ? '[ Waiting at Pickup Point ]' : '[ Active Navigation to Destination ]'}
        </Text>
        <Text style={styles.gpsCoords}>
          Dest: {activeTrip.destinationLocation?.lat?.toFixed(5)},{' '}
          {activeTrip.destinationLocation?.lng?.toFixed(5)}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Destination Address</Text>
        <Text style={styles.address}>{activeTrip.destinationAddress}</Text>

        <View style={styles.row}>
          <View>
            <Text style={styles.label}>Fare (Est.)</Text>
            <Text style={styles.fare}>NGN {(activeTrip.totalFare / 100).toFixed(2)}</Text>
          </View>
          {isSOSActive && <Text style={styles.sosBadge}>🚨 SOS ACTIVE</Text>}
        </View>
      </View>

      <View style={styles.actions}>
        <Button
          label="💬 Message Passenger"
          onPress={() => navigation.navigate('TripChat', { tripId: activeTrip.id })}
          variant="outline"
        />
        {isEnRoute ? (
          <Button label="Start Ride" onPress={handleStart} />
        ) : (
          <>
            <Button label="End & Complete Ride" onPress={handleComplete} style={styles.completeBtn} />
            <Button label="🚨 Emergency SOS" onPress={handleSOS} variant="secondary" style={styles.sosBtn} />
          </>
        )}
      </View>
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fare: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.primaryGreen,
  },
  sosBadge: {
    color: theme.colors.error,
    fontWeight: '700',
    fontSize: 14,
  },
  actions: {
    gap: theme.spacing.sm,
  },
  completeBtn: {
    backgroundColor: theme.colors.primaryGreen,
  },
  sosBtn: {
    backgroundColor: theme.colors.error,
  },
});
