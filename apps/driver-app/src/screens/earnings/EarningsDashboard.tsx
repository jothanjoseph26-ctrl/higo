import React, { useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  Alert,
  ScrollView,
  Pressable,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEarningsStore } from '../../stores/earningsStore';
import { Button } from '../../components/Button';
import { theme } from '../../theme';
import type { DriverMainStackParamList } from '../../navigation/types';

export function EarningsDashboard() {
  const { t } = useTranslation();
  const navigation =
    useNavigation<NativeStackNavigationProp<DriverMainStackParamList>>();
  const { summary, history, isLoading, error, fetchSummary, fetchHistory, withdrawEarnings } =
    useEarningsStore();

  useEffect(() => {
    void fetchSummary();
    void fetchHistory();
  }, [fetchSummary, fetchHistory]);

  const handleWithdraw = () => {
    if (!summary || summary.netPayout <= 0) {
      Alert.alert('No Funds Available', 'You do not have any earnings to withdraw.');
      return;
    }

    Alert.prompt(
      'Withdraw Earnings',
      `Enter amount to withdraw (Max: NGN ${(summary.netPayout / 100).toFixed(2)})`,
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
            if (amountKobo > summary.netPayout) {
              Alert.alert('Insufficient Balance', 'You cannot withdraw more than your total earnings.');
              return;
            }

            try {
              await withdrawEarnings(amountKobo);
              Alert.alert('Success', 'Withdrawal process initiated successfully.');
              void fetchSummary();
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : 'Withdrawal failed. Check details and try again.';
              Alert.alert('Failed', message);
            }
          },
        },
      ],
      'plain-text',
      ''
    );
  };

  const totalNaira = summary ? (summary.netPayout / 100).toFixed(2) : '0.00';
  const dailyData = summary?.daily || [];
  const maxAmount = Math.max(...dailyData.map((d) => d.net), 100000);

  const formatTripDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-NG', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Earnings Dashboard</Text>

      {isLoading && !summary && (
        <ActivityIndicator size="large" color={theme.colors.primaryGreen} style={styles.loader} />
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      {summary && (
        <>
          <View style={styles.aiCard}>
            <Text style={styles.aiBadge}>🤖 Higo AI Assistant</Text>
            <Text style={styles.aiSummary}>{summary.summary}</Text>
          </View>

          <View style={styles.totalsCard}>
            <Text style={styles.totalLabel}>Available Balance</Text>
            <Text style={styles.totalValue}>NGN {totalNaira}</Text>
            <Text style={styles.tripCount}>
              {summary.totalTrips} trip{summary.totalTrips !== 1 ? 's' : ''} today
            </Text>
            <Button label="Withdraw Funds" onPress={handleWithdraw} style={styles.withdrawBtn} />
          </View>

          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Daily Net Earnings</Text>
            <View style={styles.chartWrapper}>
              {dailyData.length === 0 ? (
                <Text style={styles.noData}>No earnings data for this period</Text>
              ) : (
                dailyData.map((d, index) => {
                  const heightPercent = Math.max(8, (d.net / maxAmount) * 80);
                  const dayNaira = (d.net / 100).toFixed(0);
                  return (
                    <View key={index} style={styles.barColumn}>
                      <Text style={styles.barValue}>₦{dayNaira}</Text>
                      <View style={styles.barContainer}>
                        <View style={[styles.bar, { height: `${heightPercent}%` }]} />
                      </View>
                      <Text style={styles.barLabel}>{d.date.slice(5)}</Text>
                    </View>
                  );
                })
              )}
            </View>
          </View>
        </>
      )}

      <View style={styles.historyCard}>
        <Text style={styles.chartTitle}>Recent Trips</Text>
        {isLoading && history.length === 0 ? (
          <ActivityIndicator size="small" color={theme.colors.primaryGreen} />
        ) : history.length === 0 ? (
          <Text style={styles.noData}>No completed trips yet</Text>
        ) : (
          history.map((entry) => (
            <Pressable
              key={entry.tripId}
              style={styles.tripRow}
              onPress={() =>
                navigation.navigate('TripEarningsDetail', { tripId: entry.tripId })
              }
            >
              <View style={styles.tripLeft}>
                <Text style={styles.tripPayout}>
                  ₦{(entry.driverPayout / 100).toFixed(2)}
                </Text>
                <Text style={styles.tripDate}>{formatTripDate(entry.date)}</Text>
              </View>
              <View style={styles.tripRight}>
                <Text style={styles.tripStatus}>
                  {entry.paymentStatus === 'released' ? 'Paid' : 'Pending'}
                </Text>
                <Text style={styles.tripChevron}>›</Text>
              </View>
            </Pressable>
          ))
        )}
      </View>
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
  tripCount: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: theme.spacing.sm,
  },
  withdrawBtn: {
    width: '100%',
  },
  chartCard: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
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
  noData: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    paddingVertical: theme.spacing.md,
    width: '100%',
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
  historyCard: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    ...theme.shadow.sm,
  },
  tripRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  tripLeft: {
    flex: 1,
  },
  tripPayout: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.darkNavy,
  },
  tripDate: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  tripRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tripStatus: {
    fontSize: 12,
    color: theme.colors.primaryGreen,
    fontWeight: '600',
  },
  tripChevron: {
    fontSize: 20,
    color: '#9CA3AF',
  },
});