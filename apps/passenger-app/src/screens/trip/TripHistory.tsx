import React, { useEffect } from 'react';
import { StyleSheet, Text, View, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme';
import { ScreenShell } from '../../components/ScreenShell';
import { Button } from '../../components/Button';
import { useTripStore } from '../../stores/tripStore';
import { getTripHistoryCache } from '../../services/storage';
import { OfflineManager } from '../../services/offline';
import type { Trip } from '@higo/shared-types';

export function TripHistory() {
  const { t } = useTranslation();
  const {
    tripHistory,
    historyLoading,
    historyError,
    fetchTripHistory,
  } = useTripStore();

  const loadHistory = async (isRefresh = false) => {
    const isOnline = OfflineManager.getIsConnected();

    if (!isOnline) {
      const cached = await getTripHistoryCache();
      if (cached) {
        useTripStore.setState({ tripHistory: cached, historyLoading: false, historyError: null });
      } else {
        useTripStore.setState({
          historyLoading: false,
          historyError: 'You are offline. No cached trip history available.',
        });
      }
      return;
    }

    try {
      await fetchTripHistory();
    } catch {
      // Error state is set in the store action
    }
  };

  useEffect(() => {
    void loadHistory();
  }, []);

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-NG', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const renderItem = ({ item }: { item: Trip }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
        <Text style={[styles.status, item.status === 'completed' ? styles.statusCompleted : styles.statusCancelled]}>
          {item.status.toUpperCase()}
        </Text>
      </View>

      <View style={styles.route}>
        <Text style={styles.bullet}>🟢 <Text style={styles.addressText} numberOfLines={1}>{item.pickupAddress}</Text></Text>
        <Text style={styles.bullet}>🔴 <Text style={styles.addressText} numberOfLines={1}>{item.destinationAddress}</Text></Text>
      </View>

      <View style={styles.cardFooter}>
        <Text style={styles.vehicleType}>🛺 {item.vehicleType.toUpperCase()}</Text>
        <Text style={styles.fare}>₦{(item.totalFare / 100).toFixed(2)}</Text>
      </View>
    </View>
  );

  if (historyLoading && tripHistory.length === 0) {
    return (
      <ScreenShell title={t('trip.tripHistory')} scroll={false}>
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={theme.colors.primaryGreen} />
        </View>
      </ScreenShell>
    );
  }

  if (historyError && tripHistory.length === 0) {
    return (
      <ScreenShell title={t('trip.tripHistory')} scroll={false}>
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{historyError}</Text>
          <Button label="Retry" onPress={() => void loadHistory()} />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title={t('trip.tripHistory')} scroll={false}>
      {historyError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{historyError}</Text>
        </View>
      ) : null}
      <FlatList
        data={tripHistory}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={historyLoading} onRefresh={() => void loadHistory(true)} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{t('trip.noTrips')}</Text>
          </View>
        }
        contentContainerStyle={styles.list}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingBottom: 20,
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  errorText: {
    fontSize: 15,
    color: theme.colors.error,
    textAlign: 'center',
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: theme.radius.input,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  errorBannerText: {
    fontSize: 13,
    color: theme.colors.error,
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  date: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  status: {
    fontSize: 12,
    fontWeight: '700',
  },
  statusCompleted: {
    color: theme.colors.success,
  },
  statusCancelled: {
    color: theme.colors.error,
  },
  route: {
    gap: 4,
    marginVertical: theme.spacing.xs,
  },
  bullet: {
    fontSize: 13,
    color: theme.colors.dark,
  },
  addressText: {
    fontWeight: '500',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: theme.spacing.sm,
  },
  vehicleType: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.darkNavy,
  },
  fare: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.primaryGreen,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 15,
    color: '#9CA3AF',
  },
});