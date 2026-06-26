import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PaymentMethod, type EarningEntry, type Trip } from '@higo/shared-types';
import { api } from '../../services/api';
import { theme } from '../../theme';
import type { DriverMainStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<DriverMainStackParamList, 'TripEarningsDetail'>;

const COMMISSION_RATE = 0.1;

function formatKobo(kobo: number): string {
  return `NGN ${(kobo / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-NG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function BreakdownRow({
  label,
  value,
  highlight,
  negative,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  negative?: boolean;
}) {
  return (
    <View style={styles.breakdownRow}>
      <Text style={styles.breakdownLabel}>{label}</Text>
      <Text
        style={[
          styles.breakdownValue,
          highlight && styles.breakdownHighlight,
          negative && styles.breakdownNegative,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

export function TripEarningsDetail({ route }: Props) {
  const { tripId } = route.params;
  const [trip, setTrip] = useState<Trip | null>(null);
  const [earning, setEarning] = useState<EarningEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const [tripData, earningsData] = await Promise.all([
          api.request<Trip>({ method: 'GET', url: `/trips/${tripId}` }),
          api.request<{ items: EarningEntry[] }>({
            method: 'GET',
            url: '/payments/earnings',
            params: { limit: 50 },
          }),
        ]);

        if (cancelled) return;

        setTrip(tripData);
        const match = earningsData.items?.find((e) => e.tripId === tripId);
        if (match) {
          setEarning(match);
        } else {
          const grossFare = tripData.totalFare;
          const platformFee = Math.round(grossFare * COMMISSION_RATE);
          const driverPayout = Math.round(grossFare * (1 - COMMISSION_RATE));
          setEarning({
            tripId: tripData.id,
            date: tripData.completedAt || tripData.createdAt,
            grossFare,
            platformFee,
            driverPayout,
            paymentMethod: tripData.paymentMethod || PaymentMethod.CARD,
            paymentStatus: tripData.paymentStatus,
          });
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load trip earnings');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primaryGreen} />
      </View>
    );
  }

  if (error || !trip || !earning) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error || 'Trip earnings not found'}</Text>
      </View>
    );
  }

  const surgeApplied = trip.surgeMultiplier > 1;
  const subtotalBeforeSurge = trip.baseFare + trip.distanceFare + trip.timeFare;
  const surgeAmount = surgeApplied
    ? Math.round(subtotalBeforeSurge * (trip.surgeMultiplier - 1))
    : 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Trip Earnings</Text>
      <Text style={styles.dateText}>{formatDate(earning.date)}</Text>

      <View style={styles.payoutCard}>
        <Text style={styles.payoutLabel}>Your Payout</Text>
        <Text style={styles.payoutValue}>{formatKobo(earning.driverPayout)}</Text>
        <View style={styles.statusBadge}>
          <Text style={styles.statusText}>
            {earning.paymentStatus === 'released' ? '✓ Paid' : '⏳ Pending Release'}
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Route</Text>
        <View style={styles.routeRow}>
          <Text style={styles.routeDot}>●</Text>
          <Text style={styles.routeText}>{trip.pickupAddress}</Text>
        </View>
        <View style={styles.routeConnector} />
        <View style={styles.routeRow}>
          <Text style={[styles.routeDot, styles.routeDotDest]}>●</Text>
          <Text style={styles.routeText}>{trip.destinationAddress}</Text>
        </View>
        {trip.distanceKm != null && (
          <Text style={styles.metaText}>
            {trip.distanceKm.toFixed(1)} km
            {trip.durationMin != null ? ` · ${trip.durationMin} min` : ''}
          </Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Fare Breakdown</Text>
        <BreakdownRow label="Base fare" value={formatKobo(trip.baseFare)} />
        <BreakdownRow label="Distance fare" value={formatKobo(trip.distanceFare)} />
        <BreakdownRow label="Time fare" value={formatKobo(trip.timeFare)} />
        {surgeApplied && (
          <BreakdownRow
            label={`Surge (${trip.surgeMultiplier.toFixed(1)}×)`}
            value={`+${formatKobo(surgeAmount)}`}
          />
        )}
        <View style={styles.divider} />
        <BreakdownRow label="Gross fare" value={formatKobo(earning.grossFare)} highlight />
        <BreakdownRow
          label="HiGo platform fee (10%)"
          value={`-${formatKobo(earning.platformFee)}`}
          negative
        />
        <View style={styles.divider} />
        <BreakdownRow label="Net payout" value={formatKobo(earning.driverPayout)} highlight />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Payment</Text>
        <BreakdownRow
          label="Method"
          value={earning.paymentMethod.replace('_', ' ').toUpperCase()}
        />
        <BreakdownRow label="Status" value={earning.paymentStatus.replace('_', ' ')} />
        {trip.driverRating != null && (
          <BreakdownRow label="Passenger rated you" value={`★ ${trip.driverRating}/5`} />
        )}
      </View>

      <Text style={styles.tripIdText}>Trip ID: {tripId.slice(0, 8)}…</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.lightGrey,
  },
  content: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.lightGrey,
    padding: theme.spacing.md,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.darkNavy,
  },
  dateText: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
    marginBottom: theme.spacing.md,
  },
  payoutCard: {
    backgroundColor: theme.colors.darkNavy,
    borderRadius: theme.radius.card,
    padding: theme.spacing.lg,
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  payoutLabel: {
    fontSize: 13,
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  payoutValue: {
    fontSize: 36,
    fontWeight: '700',
    color: theme.colors.primaryGreen,
    marginVertical: theme.spacing.sm,
  },
  statusBadge: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    color: '#E5E7EB',
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadow.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.darkNavy,
    marginBottom: theme.spacing.sm,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  routeDot: {
    fontSize: 10,
    color: theme.colors.primaryGreen,
    marginTop: 4,
  },
  routeDotDest: {
    color: theme.colors.accentOrange,
  },
  routeConnector: {
    width: 1,
    height: 16,
    backgroundColor: '#D1D5DB',
    marginLeft: 4,
    marginVertical: 2,
  },
  routeText: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.darkNavy,
    lineHeight: 20,
  },
  metaText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: theme.spacing.sm,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  breakdownLabel: {
    fontSize: 14,
    color: '#4B5563',
  },
  breakdownValue: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.darkNavy,
  },
  breakdownHighlight: {
    color: theme.colors.primaryGreen,
    fontSize: 15,
  },
  breakdownNegative: {
    color: theme.colors.error,
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: theme.spacing.sm,
  },
  tripIdText: {
    fontSize: 11,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: theme.spacing.sm,
  },
  errorText: {
    fontSize: 14,
    color: theme.colors.error,
    textAlign: 'center',
  },
});