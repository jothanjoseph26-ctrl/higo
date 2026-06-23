import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme';
import { FareCard } from '../../components/FareCard';
import { Button } from '../../components/Button';
import { ScreenShell } from '../../components/ScreenShell';
import { useTripStore } from '../../stores/tripStore';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { VehicleType, PaymentMethod } from '@higo/shared-types';

type Props = NativeStackScreenProps<RootStackParamList, 'RideOptions'>;

export function RideOptions({ navigation }: Props) {
  const { t } = useTranslation();
  const {
    pickup,
    destination,
    vehicleType,
    paymentMethod,
    isShared,
    setVehicleType,
    setIsShared,
    setEstimate,
    estimate,
  } = useTripStore();

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate estimate calculation based on GPS distance
    if (!pickup || !destination) return;

    setLoading(true);
    const timer = setTimeout(() => {
      // Basic distance estimate in km using lat/lng
      const dLat = destination.lat - pickup.lat;
      const dLng = destination.lng - pickup.lng;
      const distanceKm = Math.max(Math.sqrt(dLat * dLat + dLng * dLng) * 100, 1.2); // minimum 1.2km
      const durationMin = Math.ceil(distanceKm * 2.5); // 2.5 min per km

      // Base fare ₦200 = 20000 kobo
      const baseFare = 20000;
      const distanceFare = Math.round(distanceKm * 15000); // ₦150 per km
      const timeFare = durationMin * 5000; // ₦50 per min
      const surgeMultiplier = 1.0;
      const totalFare = Math.round((baseFare + distanceFare + timeFare) * surgeMultiplier);

      const calculatedEstimate = {
        baseFare,
        distanceFare,
        timeFare,
        surgeMultiplier,
        totalFare,
        distanceKm,
        durationMin,
      };

      setEstimate(calculatedEstimate);
      setLoading(false);
    }, 1500);

    return () => clearTimeout(timer);
  }, [pickup, destination, setEstimate]);

  const handleChoose = () => {
    navigation.navigate('ConfirmRide');
  };

  return (
    <ScreenShell title="Choose Ride Option" scroll={false} contentStyle={styles.container}>
      <View style={styles.summaryCard}>
        <View style={styles.row}>
          <Text style={styles.bullet}>🟢</Text>
          <Text style={styles.address} numberOfLines={1}>
            {pickup?.address}
          </Text>
        </View>
        <View style={styles.line} />
        <View style={styles.row}>
          <Text style={styles.bullet}>🔴</Text>
          <Text style={styles.address} numberOfLines={1}>
            {destination?.address}
          </Text>
        </View>
      </View>

      <View style={styles.space}>
        {loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="large" color={theme.colors.primaryGreen} />
            <Text style={styles.loaderText}>Calculating best fares...</Text>
          </View>
        ) : (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Trip Details</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Estimated Distance</Text>
              <Text style={styles.detailVal}>{estimate?.distanceKm.toFixed(1)} km</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Estimated Time</Text>
              <Text style={styles.detailVal}>{estimate?.durationMin} mins</Text>
            </View>
          </View>
        )}
      </View>

      {!loading && estimate && (
        <View style={styles.fareCardWrapper}>
          <FareCard
            baseFare={estimate.totalFare}
            selectedType={vehicleType}
            onSelectType={setVehicleType}
            isShared={isShared}
            onToggleShared={setIsShared}
          />
          <Button
            label="Select Payment & Book"
            onPress={handleChoose}
            style={styles.bookBtn}
          />
        </View>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 0,
  },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bullet: {
    fontSize: 14,
    marginRight: theme.spacing.sm,
  },
  address: {
    fontSize: 14,
    color: theme.colors.dark,
    fontWeight: '500',
    flex: 1,
  },
  line: {
    width: 1.5,
    height: 12,
    backgroundColor: '#D1D5DB',
    marginLeft: 6,
    marginVertical: 2,
  },
  space: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  loaderWrap: {
    alignItems: 'center',
  },
  loaderText: {
    marginTop: theme.spacing.sm,
    fontSize: 14,
    color: '#6B7280',
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.darkNavy,
    marginBottom: theme.spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  detailLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  detailVal: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.darkNavy,
  },
  fareCardWrapper: {
    width: '100%',
  },
  bookBtn: {
    margin: theme.spacing.md,
  },
});
