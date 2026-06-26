import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, Pressable, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme';
import { MapView } from '../../components/MapView';
import { useRouteDirections } from '../../hooks/useRouteDirections';
import { Button } from '../../components/Button';
import { useTripStore } from '../../stores/tripStore';
import { useLocationStore } from '../../stores/locationStore';
import { startEmergencySosSharing, stopEmergencySosSharing } from '../../services/location';
import { getEmergencyContacts } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { TripStatus } from '@higo/shared-types';

type Props = NativeStackScreenProps<RootStackParamList, 'TripActive'>;

export function TripActive({ navigation }: Props) {
  const { t } = useTranslation();
  const { userLocation } = useLocationStore();
  const { currentTrip, driverLocation, status, eta, tripError, clearTripState } = useTripStore();
  const pickupLocation = currentTrip?.pickupLocation
    ? { lat: currentTrip.pickupLocation.lat, lng: currentTrip.pickupLocation.lng }
    : null;
  const destinationLocation = currentTrip?.destinationLocation
    ? {
        lat: currentTrip.destinationLocation.lat,
        lng: currentTrip.destinationLocation.lng,
      }
    : null;
  const routePolyline = useRouteDirections(pickupLocation, destinationLocation);

  const [sosActive, setSosActive] = useState(false);

  useEffect(() => {
    if (status === TripStatus.COMPLETED) {
      navigation.replace('TripComplete');
    }
  }, [status, navigation]);

  useEffect(() => {
    if (status === TripStatus.CANCELLED) {
      Alert.alert('Ride Cancelled', tripError || 'Your trip was cancelled.', [
        {
          text: 'OK',
          onPress: () => {
            clearTripState();
            navigation.navigate('Main', { screen: 'HomeTab' });
          },
        },
      ]);
    }
  }, [status, tripError, navigation, clearTripState]);

  // Cleanup SOS on unmount
  useEffect(() => {
    return () => {
      stopEmergencySosSharing();
    };
  }, []);

  const resolveEmergencyPhones = async (): Promise<string[]> => {
    const profileContacts = useAuthStore.getState().user?.emergencyContacts;
    if (profileContacts && profileContacts.length > 0) {
      return profileContacts.map((c) => c.phone.trim()).filter(Boolean);
    }

    const contacts = await getEmergencyContacts();
    return contacts.map((c) => c.phone.trim()).filter(Boolean);
  };

  const handleSosTrigger = () => {
    if (!currentTrip) return;

    void (async () => {
      let phones: string[] = [];
      try {
        phones = await resolveEmergencyPhones();
      } catch (e) {
        console.warn('Failed to load emergency contacts for SOS', e);
        Alert.alert('Error', 'Could not load emergency contacts. Please try again.');
        return;
      }

      if (phones.length === 0) {
        Alert.alert(
          'No Emergency Contacts',
          'Add at least one emergency contact before using SOS.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Add Contacts', onPress: () => navigation.navigate('SOS') },
          ],
        );
        return;
      }

      Alert.alert(
        t('trip.sosTitle'),
        'Are you sure you want to trigger emergency SOS? This will alert our security dispatch and SMS your emergency contacts.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Trigger SOS',
            style: 'destructive',
            onPress: () => {
              setSosActive(true);
              startEmergencySosSharing(currentTrip.id, phones, (loc) => {
                console.log('Distress GPS ticks published:', loc);
              });
            },
          },
        ],
      );
    })();
  };

  const handleCancelSos = () => {
    stopEmergencySosSharing();
    setSosActive(false);
    Alert.alert('SOS Cancelled', 'Emergency alerts have been deactivated.');
  };

  return (
    <View style={styles.container}>
      <MapView
        pickup={pickupLocation}
        destination={destinationLocation}
        driverLocation={driverLocation}
        routePolyline={routePolyline}
      />

      {sosActive ? (
        <View style={styles.sosBanner}>
          <Text style={styles.sosBannerText}>🚨 {t('trip.sosActive')}</Text>
          <Button
            label={t('trip.cancelSos')}
            onPress={handleCancelSos}
            variant="outline"
            style={styles.cancelSosBtn}
          />
        </View>
      ) : (
        <Pressable onPress={handleSosTrigger} style={styles.sosButton}>
          <Text style={styles.sosButtonIcon}>🚨</Text>
        </Pressable>
      )}

      <Pressable
        onPress={() => currentTrip && navigation.navigate('TripChat', { tripId: currentTrip.id })}
        style={styles.chatButton}
      >
        <Text style={styles.chatButtonIcon}>💬</Text>
      </Pressable>

      <View style={styles.sheet}>
        <Text style={styles.activeText}>🛺 {t('trip.tripActive')}</Text>
        <View style={styles.etaContainer}>
          <Text style={styles.etaLabel}>Estimated Time to Destination</Text>
          <Text style={styles.etaValue}>{t('trip.etaMinutes', { eta: eta ?? 8 })}</Text>
        </View>
        <Button
          label="Message Driver"
          onPress={() => currentTrip && navigation.navigate('TripChat', { tripId: currentTrip.id })}
          style={styles.chatBtn}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  chatButton: {
    position: 'absolute',
    top: 60,
    left: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 4,
  },
  chatButtonIcon: {
    fontSize: 22,
  },
  chatBtn: {
    marginTop: theme.spacing.md,
    width: '100%',
  },
  sosButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 8,
  },
  sosButtonIcon: {
    fontSize: 24,
  },
  sosBanner: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    backgroundColor: theme.colors.error,
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 8,
  },
  sosBannerText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  cancelSosBtn: {
    borderColor: '#fff',
    backgroundColor: 'rgba(255,255,255,0.2)',
    width: '100%',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: theme.radius.card,
    borderTopRightRadius: theme.radius.card,
    padding: theme.spacing.lg,
    shadowColor: theme.colors.darkNavy,
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: -4 },
    shadowRadius: 12,
    elevation: 10,
    alignItems: 'center',
  },
  activeText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.primaryGreen,
    marginBottom: theme.spacing.sm,
  },
  etaContainer: {
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F2F4F7',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
  },
  etaLabel: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 4,
  },
  etaValue: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.darkNavy,
  },
});
