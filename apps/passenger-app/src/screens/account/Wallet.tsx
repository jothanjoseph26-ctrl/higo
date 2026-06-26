import React, { useCallback, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme';
import { ScreenShell } from '../../components/ScreenShell';
import { Button } from '../../components/Button';
import { useTripStore } from '../../stores/tripStore';
import { PaymentMethod, TripStatus, type Trip } from '@higo/shared-types';

function formatTripDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-NG', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function paymentMethodLabel(method: PaymentMethod | null): string {
  switch (method) {
    case PaymentMethod.CARD:
      return 'Card · Paystack';
    case PaymentMethod.BANK:
      return 'Bank · Paystack';
    case PaymentMethod.USSD:
      return 'USSD · Paystack';
    case PaymentMethod.CASH:
      return 'Cash';
    default:
      return 'Paystack';
  }
}

function isPaystackTrip(trip: Trip): boolean {
  return (
    trip.paymentMethod !== null &&
    trip.paymentMethod !== PaymentMethod.CASH &&
    trip.status === TripStatus.COMPLETED
  );
}

export function Wallet() {
  const { t } = useTranslation();
  const {
    triviaPoints,
    hydrateTriviaPoints,
    tripHistory,
    historyLoading,
    historyError,
    fetchTripHistory,
  } = useTripStore();

  const loadPayments = useCallback(async () => {
    try {
      await fetchTripHistory();
    } catch {
      // Store action sets historyError
    }
  }, [fetchTripHistory]);

  useEffect(() => {
    void hydrateTriviaPoints();
    void loadPayments();
  }, [hydrateTriviaPoints, loadPayments]);

  const paystackTrips = useMemo(
    () =>
      tripHistory
        .filter(isPaystackTrip)
        .sort(
          (a, b) =>
            new Date(b.completedAt ?? b.createdAt).getTime() -
            new Date(a.completedAt ?? a.createdAt).getTime(),
        )
        .slice(0, 12),
    [tripHistory],
  );

  const totalPaidKobo = useMemo(
    () => paystackTrips.reduce((sum, trip) => sum + trip.totalFare, 0),
    [paystackTrips],
  );

  return (
    <ScreenShell
      title="Payments & Rewards"
      subtitle="Trip payment history via Paystack — not a CBN-licensed wallet"
      scroll={false}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={historyLoading}
            onRefresh={() => void loadPayments()}
            tintColor={theme.colors.primaryGreen}
          />
        }
      >
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Trip payments via Paystack</Text>
          <Text style={styles.infoText}>
            This screen shows your completed cashless trip fares from the API. HiGo does not operate
            a stored-value wallet (no CBN PSSP license).
          </Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Recent Paystack trip spend</Text>
          <Text style={styles.summaryValue}>₦{(totalPaidKobo / 100).toFixed(2)}</Text>
          <Text style={styles.summarySub}>
            {paystackTrips.length} completed cashless {paystackTrips.length === 1 ? 'trip' : 'trips'}
          </Text>
        </View>

        <View style={styles.historyCard}>
          <Text style={styles.historyHeader}>Trip payment history</Text>

          {historyLoading && paystackTrips.length === 0 ? (
            <View style={styles.loader}>
              <ActivityIndicator color={theme.colors.primaryGreen} />
              <Text style={styles.loaderText}>Loading trips…</Text>
            </View>
          ) : null}

          {historyError && paystackTrips.length === 0 ? (
            <View style={styles.errorWrap}>
              <Text style={styles.errorText}>{historyError}</Text>
              <Button label="Retry" onPress={() => void loadPayments()} />
            </View>
          ) : null}

          {!historyLoading && !historyError && paystackTrips.length === 0 ? (
            <Text style={styles.emptyText}>
              No completed Paystack trips yet. Book a ride with card, bank, or USSD to see payments
              here.
            </Text>
          ) : null}

          {paystackTrips.map((trip) => (
            <View key={trip.id} style={styles.row}>
              <View style={styles.rowLeft}>
                <Text style={styles.label} numberOfLines={1}>
                  Ride to {trip.destinationAddress}
                </Text>
                <Text style={styles.rowMeta}>
                  {formatTripDate(trip.completedAt ?? trip.createdAt)} ·{' '}
                  {paymentMethodLabel(trip.paymentMethod)}
                </Text>
              </View>
              <Text style={[styles.val, styles.debit]}>-₦{(trip.totalFare / 100).toFixed(2)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.triviaSection}>
          <Text style={styles.triviaSectionTitle}>HiGo Trivia Points</Text>
          <View style={styles.triviaCard}>
            <Text style={styles.triviaLabel}>Reward balance</Text>
            <Text style={styles.triviaValue}>{triviaPoints} pts</Text>
            <Text style={styles.triviaEquivalent}>
              Play trivia while you wait · ≈ ₦{(triviaPoints * 10).toFixed(2)} illustrative value
            </Text>
          </View>
          <Text style={styles.triviaNote}>
            {t('trip.walletSubtitle')} Points are separate from trip payments above.
          </Text>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: theme.spacing.xl,
  },
  infoCard: {
    backgroundColor: 'rgba(11, 110, 79, 0.08)',
    borderWidth: 1,
    borderColor: theme.colors.primaryGreen,
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  infoTitle: {
    color: theme.colors.primaryGreen,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  infoText: {
    color: theme.colors.darkNavy,
    fontSize: 13,
    lineHeight: 18,
  },
  summaryCard: {
    backgroundColor: theme.colors.darkNavy,
    borderRadius: theme.radius.card,
    padding: theme.spacing.lg,
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  summaryLabel: {
    color: '#fff',
    fontSize: 14,
    opacity: 0.85,
  },
  summaryValue: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '800',
    marginVertical: theme.spacing.xs,
  },
  summarySub: {
    color: '#fff',
    fontSize: 13,
    opacity: 0.8,
  },
  historyCard: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 12,
    marginBottom: theme.spacing.lg,
  },
  historyHeader: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.darkNavy,
    marginBottom: 4,
  },
  loader: {
    alignItems: 'center',
    paddingVertical: theme.spacing.lg,
    gap: 8,
  },
  loaderText: {
    fontSize: 13,
    color: '#6B7280',
  },
  errorWrap: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
  },
  errorText: {
    fontSize: 14,
    color: theme.colors.error,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
    paddingVertical: theme.spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: theme.spacing.sm,
  },
  rowLeft: {
    flex: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.dark,
  },
  rowMeta: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  val: {
    fontSize: 14,
    fontWeight: '700',
  },
  debit: {
    color: theme.colors.darkNavy,
  },
  triviaSection: {
    gap: theme.spacing.sm,
  },
  triviaSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.darkNavy,
  },
  triviaCard: {
    backgroundColor: theme.colors.primaryGreen,
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    alignItems: 'center',
  },
  triviaLabel: {
    color: '#fff',
    fontSize: 13,
    opacity: 0.85,
  },
  triviaValue: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    marginVertical: 4,
  },
  triviaEquivalent: {
    color: '#fff',
    fontSize: 12,
    opacity: 0.9,
    textAlign: 'center',
  },
  triviaNote: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 17,
  },
});

export default Wallet;