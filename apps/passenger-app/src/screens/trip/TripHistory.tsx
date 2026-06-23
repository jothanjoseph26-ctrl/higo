import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme';
import { ScreenShell } from '../../components/ScreenShell';
import { api } from '../../services/api';
import { getTripHistoryCache, setTripHistoryCache } from '../../services/storage';
import { OfflineManager } from '../../services/offline';
import type { Trip } from '@higo/shared-types';

export function TripHistory() {
  const { t } = useTranslation();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHistory = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const isOnline = OfflineManager.getIsConnected();
      if (isOnline) {
        const response = await api.getTripHistory();
        setTrips(response.items);
        await setTripHistoryCache(response.items);
      } else {
        // Load from offline storage cache
        const cached = await getTripHistoryCache();
        if (cached) {
          setTrips(cached);
        }
      }
    } catch (e) {
      console.warn('Failed to load trip history', e);
      // Fallback to cache on error
      const cached = await getTripHistoryCache();
      if (cached) {
        setTrips(cached);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void fetchHistory();
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
        <Text style={styles.fare}>₦{(item.fare / 100).toFixed(2)}</Text>
      </View>
    </View>
  );

  return (
    <ScreenShell title={t('trip.tripHistory')} scroll={false}>
      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={theme.colors.primaryGreen} />
        </View>
      ) : (
        <FlatList
          data={trips}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void fetchHistory(true)} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>{t('trip.noTrips')}</Text>
            </View>
          }
          contentContainerStyle={styles.list}
        />
      )}
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
