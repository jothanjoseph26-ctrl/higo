import React, { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useDriverAuthStore } from '../../stores/driverAuthStore';
import { api } from '../../services/api';
import { theme } from '../../theme';

interface RatedTrip {
  id: string;
  driverRating: number | null;
  passengerRating: number | null;
  completedAt: string | null;
  createdAt: string;
  pickupAddress: string;
  destinationAddress: string;
}

function StarRow({ rating }: { rating: number }) {
  const full = Math.round(rating);
  return (
    <Text style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Text key={i} style={[styles.star, i <= full ? styles.starFilled : styles.starEmpty]}>
          ★
        </Text>
      ))}
    </Text>
  );
}

function RatingBar({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <View style={styles.barRow}>
      <Text style={styles.barLabel}>{label}</Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.barCount}>{count}</Text>
    </View>
  );
}

export function RatingsPerformance() {
  const { driver, refreshDriverProfile } = useDriverAuthStore();
  const [recentTrips, setRecentTrips] = useState<RatedTrip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      await refreshDriverProfile();

      const response = await api.request<{ trips: RatedTrip[] }>({
        method: 'GET',
        url: '/drivers/trips',
        params: { status: 'completed', limit: 20 },
      });

      const rated = (response.trips || [])
        .filter((t) => t.driverRating != null)
        .slice(0, 10);

      setRecentTrips(rated);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load ratings');
    }
  }, [refreshDriverProfile]);

  useEffect(() => {
    void (async () => {
      setIsLoading(true);
      await loadData();
      setIsLoading(false);
    })();
  }, [loadData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  const ratingAvg = driver?.ratingAvg ?? 5.0;
  const totalTrips = driver?.totalTrips ?? 0;

  const distribution = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count: recentTrips.filter((t) => Math.round(t.driverRating ?? 0) === stars).length,
  }));

  if (isLoading && !driver) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primaryGreen} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={() => void handleRefresh()}
          tintColor={theme.colors.primaryGreen}
        />
      }
    >
      <Text style={styles.title}>Ratings & Performance</Text>

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.heroCard}>
        <Text style={styles.heroRating}>{ratingAvg.toFixed(1)}</Text>
        <StarRow rating={ratingAvg} />
        <Text style={styles.heroSubtext}>
          {totalTrips} completed trip{totalTrips !== 1 ? 's' : ''}
        </Text>
        {ratingAvg >= 4.8 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>⭐ Top Performer</Text>
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Rating Distribution</Text>
        {distribution.map((d) => (
          <RatingBar
            key={d.stars}
            label={`${d.stars} ★`}
            count={d.count}
            total={recentTrips.length || 1}
          />
        ))}
        {recentTrips.length === 0 && (
          <Text style={styles.emptyHint}>No rated trips yet. Complete rides to build your score.</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Recent Passenger Ratings</Text>
        {recentTrips.length === 0 ? (
          <Text style={styles.emptyText}>Your passengers haven't rated recent trips yet.</Text>
        ) : (
          recentTrips.map((trip) => (
            <View key={trip.id} style={styles.tripRow}>
              <View style={styles.tripHeader}>
                <Text style={styles.tripRating}>★ {trip.driverRating?.toFixed(1)}</Text>
                <Text style={styles.tripDate}>
                  {new Date(trip.completedAt || trip.createdAt).toLocaleDateString('en-NG', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </Text>
              </View>
              <Text style={styles.tripRoute} numberOfLines={1}>
                {trip.pickupAddress} → {trip.destinationAddress}
              </Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.tipsCard}>
        <Text style={styles.tipsTitle}>💡 Tips to Improve</Text>
        <Text style={styles.tipItem}>• Greet passengers warmly and confirm destination</Text>
        <Text style={styles.tipItem}>• Keep vehicle clean and AC comfortable</Text>
        <Text style={styles.tipItem}>• Follow Google Maps / Waze for fastest routes</Text>
        <Text style={styles.tipItem}>• Maintain 4.8+ rating to unlock premium trip offers</Text>
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
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.lightGrey,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.darkNavy,
    marginBottom: theme.spacing.md,
  },
  error: {
    color: theme.colors.error,
    fontSize: 14,
    marginBottom: theme.spacing.md,
  },
  heroCard: {
    backgroundColor: theme.colors.darkNavy,
    borderRadius: theme.radius.card,
    padding: theme.spacing.lg,
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  heroRating: {
    fontSize: 56,
    fontWeight: '700',
    color: '#fff',
  },
  starRow: {
    flexDirection: 'row',
    marginVertical: theme.spacing.sm,
  },
  star: {
    fontSize: 22,
    marginHorizontal: 2,
  },
  starFilled: {
    color: '#FBBF24',
  },
  starEmpty: {
    color: '#4B5563',
  },
  heroSubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 4,
  },
  badge: {
    marginTop: theme.spacing.sm,
    backgroundColor: theme.colors.primaryGreen,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
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
    marginBottom: theme.spacing.md,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  barLabel: {
    width: 36,
    fontSize: 13,
    color: '#4B5563',
    fontWeight: '600',
  },
  barTrack: {
    flex: 1,
    height: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: theme.colors.primaryGreen,
    borderRadius: 4,
  },
  barCount: {
    width: 24,
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'right',
  },
  emptyHint: {
    fontSize: 13,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  tripRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    paddingVertical: theme.spacing.sm,
  },
  tripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tripRating: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FBBF24',
  },
  tripDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  tripRoute: {
    fontSize: 13,
    color: '#4B5563',
    marginTop: 4,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
  },
  tipsCard: {
    backgroundColor: '#EEFBF3',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  tipsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.darkNavy,
    marginBottom: theme.spacing.sm,
  },
  tipItem: {
    fontSize: 13,
    color: '#374151',
    lineHeight: 22,
  },
});