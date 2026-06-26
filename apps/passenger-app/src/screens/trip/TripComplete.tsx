import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme';
import { Button } from '../../components/Button';
import { ScreenShell } from '../../components/ScreenShell';
import { useTripStore } from '../../stores/tripStore';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'TripComplete'>;

export function TripComplete({ navigation }: Props) {
  const { t } = useTranslation();
  const { currentTrip, pointsEarned, estimate } = useTripStore();

  const handleProceed = () => {
    navigation.navigate('RateDriver');
  };

  const getPriceText = () => {
    // Check trip price or estimate
    const priceKobo = currentTrip?.totalFare ?? estimate?.totalFare;
    if (priceKobo == null) return '—';
    return `₦${(priceKobo / 100).toFixed(2)}`;
  };

  return (
    <ScreenShell title={t('trip.tripComplete')} scroll={false} contentStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.checkIcon}>🎉</Text>
        <Text style={styles.successText}>You have arrived safely!</Text>
        
        <View style={styles.receipt}>
          <View style={styles.row}>
            <Text style={styles.label}>Total Fare Paid</Text>
            <Text style={styles.val}>{getPriceText()}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.label}>Naija Trivia Points Earned</Text>
            <Text style={[styles.val, styles.points]}>+{pointsEarned} points</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.subtext}>Points will sync to your wallet balance.</Text>
          </View>
        </View>
      </View>

      <View style={styles.actions}>
        <Button
          label="View Receipt"
          variant="outline"
          onPress={() => navigation.navigate('TripReceipt')}
          style={styles.btn}
        />
        <Button
          label={t('common.continue')}
          onPress={handleProceed}
          style={styles.btn}
        />
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.card,
    padding: theme.spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: theme.colors.darkNavy,
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 3,
    marginBottom: theme.spacing.xl,
  },
  checkIcon: {
    fontSize: 64,
    marginBottom: theme.spacing.md,
  },
  successText: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.darkNavy,
    marginBottom: theme.spacing.xl,
  },
  receipt: {
    width: '100%',
    backgroundColor: '#F9FAFB',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 4,
  },
  label: {
    fontSize: 14,
    color: '#6B7280',
  },
  val: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.darkNavy,
  },
  points: {
    color: theme.colors.primaryGreen,
  },
  subtext: {
    fontSize: 11,
    color: '#9CA3AF',
    textAlign: 'center',
    width: '100%',
    marginTop: 4,
  },
  actions: {
    width: '100%',
    gap: theme.spacing.sm,
  },
  btn: {
    width: '100%',
  },
});
