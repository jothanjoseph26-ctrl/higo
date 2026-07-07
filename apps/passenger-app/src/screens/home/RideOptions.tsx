import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { theme } from '../../theme';
import { FareCard } from '../../components/FareCard';
import { Button } from '../../components/Button';
import { ScreenShell } from '../../components/ScreenShell';
import { useTripStore } from '../../stores/tripStore';
import { api } from '../../services/api';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'RideOptions'>;

export function RideOptions({ navigation }: Props) {
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
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [supply, setSupply] = useState<{
    nearbyDrivers: number;
    available: boolean;
    etaMin: number | null;
  } | null>(null);

  useEffect(() => {
    if (!pickup || !destination) {
      setLoading(false);
      setEstimate(null);
      setSupply(null);
      return;
    }

    let cancelled = false;

    async function loadQuote() {
      setLoading(true);
      setQuoteError(null);
      try {
        const quote = await api.quoteTrip({
          pickup: { lat: pickup.lat, lng: pickup.lng },
          pickupAddress: pickup.address,
          destination: { lat: destination.lat, lng: destination.lng },
          destinationAddress: destination.address,
          vehicleType,
          paymentMethod,
          isShared,
        });

        if (cancelled) return;
        setEstimate(quote.estimate);
        setSupply({
          nearbyDrivers: quote.supply.nearbyDrivers,
          available: quote.supply.available,
          etaMin: quote.supply.etaMin,
        });
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error
            ? err.message
            : 'Could not calculate this trip. Please check the route and try again.';
        setEstimate(null);
        setSupply(null);
        setQuoteError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadQuote();

    return () => {
      cancelled = true;
    };
  }, [pickup, destination, vehicleType, paymentMethod, isShared, setEstimate]);

  const handleChoose = () => {
    navigation.navigate('ConfirmRide');
  };

  return (
    <ScreenShell title="Choose Ride Option" scroll={false} contentStyle={styles.container}>
      <View style={styles.summaryCard}>
        <View style={styles.row}>
          <Text style={styles.bullet}>P</Text>
          <Text style={styles.address} numberOfLines={1}>
            {pickup?.address}
          </Text>
        </View>
        <View style={styles.line} />
        <View style={styles.row}>
          <Text style={styles.bullet}>D</Text>
          <Text style={styles.address} numberOfLines={1}>
            {destination?.address}
          </Text>
        </View>
      </View>

      <View style={styles.space}>
        {loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="large" color={theme.colors.primaryGreen} />
            <Text style={styles.loaderText}>Calculating live fare...</Text>
          </View>
        ) : quoteError ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Quote unavailable</Text>
            <Text style={styles.warningText}>{quoteError}</Text>
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
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Nearby Drivers</Text>
              <Text style={styles.detailVal}>{supply?.nearbyDrivers ?? 0}</Text>
            </View>
            {supply?.etaMin && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Nearest ETA</Text>
                <Text style={styles.detailVal}>{supply.etaMin} mins</Text>
              </View>
            )}
            {supply && !supply.available && (
              <Text style={styles.warningText}>
                No nearby drivers are available right now. Please try again shortly.
              </Text>
            )}
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
            disabled={supply ? !supply.available : false}
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
    width: 18,
    height: 18,
    borderRadius: 9,
    marginRight: theme.spacing.sm,
    backgroundColor: '#E8F5EF',
    color: theme.colors.primaryGreen,
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 18,
    textAlign: 'center',
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
    marginLeft: 8,
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
  warningText: {
    marginTop: theme.spacing.sm,
    fontSize: 13,
    color: '#B45309',
    lineHeight: 18,
  },
  fareCardWrapper: {
    width: '100%',
  },
  bookBtn: {
    margin: theme.spacing.md,
  },
});
