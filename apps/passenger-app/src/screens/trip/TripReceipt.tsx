import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PaymentMethod } from '@higo/shared-types';
import { theme } from '../../theme';
import { Button } from '../../components/Button';
import { ScreenShell } from '../../components/ScreenShell';
import { useTripStore } from '../../stores/tripStore';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'TripReceipt'>;

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  [PaymentMethod.CASH]: 'Cash Payment',
  [PaymentMethod.CARD]: 'Card via Paystack',
  [PaymentMethod.BANK]: 'Bank Transfer',
  [PaymentMethod.USSD]: 'USSD Code',
};

function formatKobo(kobo: number | null | undefined): string {
  if (kobo == null) return '—';
  return `₦${(kobo / 100).toFixed(2)}`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
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

function ReceiptRow({
  label,
  value,
  bold,
  highlight,
}: {
  label: string;
  value: string;
  bold?: boolean;
  highlight?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.label, bold && styles.labelBold]}>{label}</Text>
      <Text style={[styles.value, bold && styles.valueBold, highlight && styles.valueHighlight]}>
        {value}
      </Text>
    </View>
  );
}

export function TripReceipt({ navigation }: Props) {
  const { t } = useTranslation();
  const { currentTrip, estimate, paymentMethod: bookingPaymentMethod } = useTripStore();

  const trip = currentTrip;
  const paymentMethod = trip?.paymentMethod ?? bookingPaymentMethod;
  const paymentLabel = paymentMethod ? PAYMENT_LABELS[paymentMethod] : '—';

  const baseFare = trip?.baseFare ?? estimate?.baseFare;
  const distanceFare = trip?.distanceFare ?? estimate?.distanceFare;
  const timeFare = trip?.timeFare ?? estimate?.timeFare;
  const surgeMultiplier = trip?.surgeMultiplier ?? estimate?.surgeMultiplier ?? 1;
  const totalFare = trip?.totalFare ?? estimate?.totalFare;
  const tripDate = trip?.completedAt ?? trip?.createdAt;

  if (!trip) {
    return (
      <ScreenShell title="Trip Receipt" scroll={false} contentStyle={styles.emptyContainer}>
        <Text style={styles.emptyText}>No trip receipt available.</Text>
        <Button label={t('common.back')} onPress={() => navigation.goBack()} />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title="Trip Receipt" subtitle="Detailed fare breakdown for your completed ride">
      <View style={styles.invoice}>
        <View style={styles.header}>
          <Text style={styles.brand}>HiGo</Text>
          <Text style={styles.invoiceLabel}>INVOICE</Text>
        </View>

        <View style={styles.metaSection}>
          <ReceiptRow label="Trip ID" value={trip.id} />
          <ReceiptRow label="Date" value={formatDate(tripDate)} />
          <ReceiptRow label="Vehicle" value={trip.vehicleType.toUpperCase()} />
          <ReceiptRow label="Payment Method" value={paymentLabel} />
        </View>

        <View style={styles.divider} />

        <View style={styles.routeSection}>
          <Text style={styles.sectionTitle}>Route</Text>
          <Text style={styles.routeLine}>🟢 {trip.pickupAddress}</Text>
          <Text style={styles.routeLine}>🔴 {trip.destinationAddress}</Text>
          {trip.distanceKm != null ? (
            <Text style={styles.routeMeta}>
              {trip.distanceKm.toFixed(1)} km
              {trip.durationMin != null ? ` · ${trip.durationMin} min` : ''}
            </Text>
          ) : null}
        </View>

        <View style={styles.divider} />

        <View style={styles.fareSection}>
          <Text style={styles.sectionTitle}>Fare Breakdown</Text>
          <ReceiptRow label="Base fare" value={formatKobo(baseFare)} />
          <ReceiptRow label="Distance fare" value={formatKobo(distanceFare)} />
          <ReceiptRow label="Time fare" value={formatKobo(timeFare)} />
          {surgeMultiplier > 1 ? (
            <ReceiptRow label="Surge multiplier" value={`×${surgeMultiplier.toFixed(2)}`} />
          ) : null}
        </View>

        <View style={styles.divider} />

        <ReceiptRow label="Total Paid" value={formatKobo(totalFare)} bold highlight />

        {trip.paystackReference ? (
          <Text style={styles.reference}>Ref: {trip.paystackReference}</Text>
        ) : null}
      </View>

      <Button label={t('common.back')} onPress={() => navigation.goBack()} style={styles.backBtn} />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  emptyContainer: {
    justifyContent: 'center',
    gap: theme.spacing.md,
  },
  emptyText: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },
  invoice: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.card,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: theme.spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  brand: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.primaryGreen,
  },
  invoiceLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 1.2,
  },
  metaSection: {
    gap: 10,
  },
  routeSection: {
    gap: 6,
  },
  fareSection: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.darkNavy,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  routeLine: {
    fontSize: 14,
    color: theme.colors.darkNavy,
    lineHeight: 20,
  },
  routeMeta: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  label: {
    fontSize: 14,
    color: '#6B7280',
    flex: 1,
  },
  labelBold: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.darkNavy,
  },
  value: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.darkNavy,
    textAlign: 'right',
    flexShrink: 1,
  },
  valueBold: {
    fontSize: 18,
    fontWeight: '800',
  },
  valueHighlight: {
    color: theme.colors.primaryGreen,
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: theme.spacing.md,
  },
  reference: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: theme.spacing.sm,
    textAlign: 'right',
  },
  backBtn: {
    marginBottom: 40,
  },
});

export default TripReceipt;