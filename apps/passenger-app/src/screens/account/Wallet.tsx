import React, { useEffect } from 'react';
import { StyleSheet, Text, View, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme';
import { ScreenShell } from '../../components/ScreenShell';
import { Button } from '../../components/Button';
import { useTripStore } from '../../stores/tripStore';

export function Wallet() {
  const { t } = useTranslation();
  const { triviaPoints, hydrateTriviaPoints } = useTripStore();

  useEffect(() => {
    void hydrateTriviaPoints();
  }, [hydrateTriviaPoints]);

  const handleTopUp = () => {
    Alert.alert(
      'Wallet top-up',
      'This wallet is a UI stub for local testing (No CBN PSSP license active). Financial operations are disabled.'
    );
  };

  return (
    <ScreenShell title={t('trip.walletTitle')} subtitle="Manage points and rewards balance">
      <View style={styles.warningCard}>
        <Text style={styles.warningTitle}>⚠️ DEMO MODE ONLY</Text>
        <Text style={styles.warningText}>
          {t('trip.walletSubtitle')} Real payments, top-ups, and balance withdrawals are disabled.
        </Text>
      </View>

      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>HiGo Trivia Points</Text>
        <Text style={styles.balanceValue}>{triviaPoints} pts</Text>
        <Text style={styles.equivalent}>Equivalent to: ₦{(triviaPoints * 10).toFixed(2)}</Text>
      </View>

      <View style={styles.historyCard}>
        <Text style={styles.historyHeader}>Recent Transactions</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Naija Trivia Wait Reward</Text>
          <Text style={[styles.val, styles.green]}>+25 pts</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Naija Trivia Wait Reward</Text>
          <Text style={[styles.val, styles.green]}>+15 pts</Text>
        </View>
      </View>

      <Button
        label="Top Up Points"
        onPress={handleTopUp}
        style={styles.btn}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  warningCard: {
    backgroundColor: 'rgba(255, 122, 0, 0.1)',
    borderWidth: 1,
    borderColor: theme.colors.accentOrange,
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  warningTitle: {
    color: theme.colors.accentOrange,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  warningText: {
    color: theme.colors.darkNavy,
    fontSize: 13,
    lineHeight: 18,
  },
  balanceCard: {
    backgroundColor: theme.colors.primaryGreen,
    borderRadius: theme.radius.card,
    padding: theme.spacing.lg,
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
    shadowColor: theme.colors.darkNavy,
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 3,
  },
  balanceLabel: {
    color: '#fff',
    fontSize: 14,
    opacity: 0.8,
  },
  balanceValue: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '800',
    marginVertical: theme.spacing.xs,
  },
  equivalent: {
    color: '#fff',
    fontSize: 14,
    opacity: 0.9,
    fontWeight: '600',
  },
  historyCard: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 12,
    marginBottom: theme.spacing.xl,
  },
  historyHeader: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.darkNavy,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 13,
    color: '#6B7280',
  },
  val: {
    fontSize: 14,
    fontWeight: '700',
  },
  green: {
    color: theme.colors.success,
  },
  btn: {
    marginTop: theme.spacing.md,
  },
});
export default Wallet;
