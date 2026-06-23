import React, { useEffect } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useEarningsStore } from '../../stores/earningsStore';
import { Button } from '../../components/Button';
import { theme } from '../../theme';

export function EarningsDashboard() {
  const { t } = useTranslation();
  const { summary, isLoading, error, fetchSummary, withdrawEarnings } = useEarningsStore();

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  const handleWithdraw = () => {
    if (!summary || summary.totals <= 0) {
      Alert.alert('No Funds Available', 'You do not have any earnings to withdraw.');
      return;
    }

    Alert.prompt(
      'Withdraw Earnings',
      `Enter amount to withdraw (Max: NGN ${(summary.totals / 100).toFixed(2)})`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw',
          onPress: async (amountText?: string) => {
            if (!amountText) return;
            const amountNgn = parseFloat(amountText);
            if (isNaN(amountNgn) || amountNgn <= 0) {
              Alert.alert('Invalid Amount', 'Please enter a valid amount.');
              return;
            }
            const amountKobo = Math.round(amountNgn * 100);
            if (amountKobo > summary.totals) {
              Alert.alert('Insufficient Balance', 'You cannot withdraw more than your total earnings.');
              return;
            }

            try {
              await withdrawEarnings(amountKobo);
              Alert.alert('Success', 'Withdrawal process initiated successfully.');
              void fetchSummary();
            } catch (err: any) {
              Alert.alert('Failed', err.message || 'Withdrawal failed. Check details and try again.');
            }
          },
        },
      ],
      'plain-text',
      ''
    );
  };

  const totalNaira = summary ? (summary.totals / 100).toFixed(2) : '0.00';
  const dailyData = summary?.daily || [];
  const maxAmount = Math.max(...dailyData.map((d) => d.amount), 100000); // Default max 1000 Naira to prevent divide by zero

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Earnings Dashboard</Text>

      {isLoading && !summary && (
        <ActivityIndicator size="large" color={theme.colors.primaryGreen} style={styles.loader} />
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      {summary && (
        <>
          {/* AI Pidgin Summary */}
          <View style={styles.aiCard}>
            <Text style={styles.aiBadge}>🤖 Higo AI Assistant</Text>
            <Text style={styles.aiSummary}>{summary.summary}</Text>
          </View>

          {/* Totals */}
          <View style={styles.totalsCard}>
            <Text style={styles.totalLabel}>Available Balance</Text>
            <Text style={styles.totalValue}>NGN {totalNaira}</Text>
            <Button label="Withdraw Funds" onPress={handleWithdraw} style={styles.withdrawBtn} />
          </View>

          {/* Recharts-free Chart */}
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Daily Net Earnings</Text>
            <View style={styles.chartWrapper}>
              {dailyData.map((d, index) => {
                const heightPercent = Math.max(8, (d.amount / maxAmount) * 80);
                const dayNaira = (d.amount / 100).toFixed(0);
                return (
                  <View key={index} style={styles.barColumn}>
                    <Text style={styles.barValue}>₦{dayNaira}</Text>
                    <View style={styles.barContainer}>
                      <View style={[styles.bar, { height: `${heightPercent}%` }]} />
                    </View>
                    <Text style={styles.barLabel}>{d.date}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        </>
      )}
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
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.darkNavy,
    marginBottom: theme.spacing.md,
  },
  loader: {
    marginVertical: theme.spacing.xl,
  },
  error: {
    color: theme.colors.error,
    fontSize: 14,
    marginBottom: theme.spacing.md,
  },
  aiCard: {
    backgroundColor: '#EEFBF3',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  aiBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.primaryGreen,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  aiSummary: {
    fontSize: 15,
    fontWeight: '500',
    color: theme.colors.darkNavy,
    lineHeight: 22,
  },
  totalsCard: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    alignItems: 'center',
    marginBottom: theme.spacing.md,
    ...theme.shadow.sm,
  },
  totalLabel: {
    fontSize: 13,
    color: '#6B7280',
    textTransform: 'uppercase',
  },
  totalValue: {
    fontSize: 32,
    fontWeight: '700',
    color: theme.colors.primaryGreen,
    marginVertical: theme.spacing.sm,
  },
  withdrawBtn: {
    width: '100%',
  },
  chartCard: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    ...theme.shadow.sm,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.darkNavy,
    marginBottom: theme.spacing.md,
  },
  chartWrapper: {
    flexDirection: 'row',
    height: 180,
    justifyContent: 'space-around',
    alignItems: 'flex-end',
  },
  barColumn: {
    alignItems: 'center',
    width: '18%',
    height: '100%',
    justifyContent: 'flex-end',
  },
  barValue: {
    fontSize: 10,
    color: theme.colors.primaryGreen,
    fontWeight: '600',
    marginBottom: 2,
  },
  barContainer: {
    height: 120,
    width: 24,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  bar: {
    width: '100%',
    backgroundColor: theme.colors.primaryGreen,
    borderRadius: 12,
  },
  barLabel: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 6,
  },
});
