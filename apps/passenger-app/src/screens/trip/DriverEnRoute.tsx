import React, { useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, Linking, Image, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme';
import { MapView } from '../../components/MapView';
import { Button } from '../../components/Button';
import { useTripStore } from '../../stores/tripStore';
import { useLocationStore } from '../../stores/locationStore';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { TripStatus } from '@higo/shared-types';

type Props = NativeStackScreenProps<RootStackParamList, 'DriverEnRoute'>;

export function DriverEnRoute({ navigation }: Props) {
  const { t } = useTranslation();
  const { userLocation } = useLocationStore();
  const { driverDetails, driverLocation, eta, status } = useTripStore();

  useEffect(() => {
    if (status === TripStatus.ACTIVE) {
      navigation.replace('TripActive');
    }
  }, [status, navigation]);

  const handleWhatsApp = () => {
    if (!driverDetails?.phone) {
      Alert.alert('Error', 'Driver phone number is not available.');
      return;
    }
    const phone = driverDetails.phone.replace(/[^0-9+]/g, '');
    const message = encodeURIComponent("Hello, I'm waiting at the pickup location!");
    const url = `https://wa.me/${phone}?text=${message}`;
    
    Linking.canOpenURL(url).then((supported) => {
      if (supported) {
        void Linking.openURL(url);
      } else {
        Alert.alert('Error', 'WhatsApp is not installed on this device.');
      }
    });
  };

  const handleCall = () => {
    if (!driverDetails?.phone) return;
    void Linking.openURL(`tel:${driverDetails.phone}`);
  };

  return (
    <View style={styles.container}>
      <MapView
        pickup={userLocation}
        driverLocation={driverLocation}
      />

      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('trip.driverEnRoute')}</Text>
          <Text style={styles.eta}>{t('trip.etaMinutes', { eta: eta ?? 5 })}</Text>
        </View>

        <View style={styles.driverRow}>
          <Text style={styles.avatar}>🛺</Text>
          <View style={styles.details}>
            <Text style={styles.name}>{driverDetails?.name || 'HiGo Partner'}</Text>
            <Text style={styles.vehicle}>
              {driverDetails?.vehicleColor} {driverDetails?.vehicleModel} · {driverDetails?.vehiclePlate}
            </Text>
            <Text style={styles.rating}>★ {driverDetails?.rating?.toFixed(1) || '5.0'}</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Button
            label="💬 Chat on WhatsApp"
            onPress={handleWhatsApp}
            style={styles.actionBtn}
          />
          <Pressable onPress={handleCall} style={styles.callBtn}>
            <Text style={styles.callIcon}>📞</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
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
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.darkNavy,
  },
  eta: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.accentOrange,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  avatar: {
    fontSize: 36,
    marginRight: theme.spacing.md,
  },
  details: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.dark,
  },
  vehicle: {
    fontSize: 13,
    color: '#6B7280',
    marginVertical: 2,
  },
  rating: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFB000',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
  },
  callBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callIcon: {
    fontSize: 20,
  },
});
