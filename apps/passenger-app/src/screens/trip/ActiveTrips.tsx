import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TripStatus, type Trip } from '@higo/shared-types';
import { theme } from '../../theme';
import { Button } from '../../components/Button';
import { ScreenShell } from '../../components/ScreenShell';
import { useTripStore } from '../../stores/tripStore';
import { api } from '../../services/api';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ActiveTrips'>;

const ACTIVE_STATUSES: TripStatus[] = [
  TripStatus.REQUESTED,
  TripStatus.MATCHED,
  TripStatus.EN_ROUTE,
  TripStatus.ACTIVE,
];

const STATUS_LABELS: Record<TripStatus, string> = {
  [TripStatus.REQUESTED]: 'Finding driver',
  [TripStatus.MATCHED]: 'Driver matched',
  [TripStatus.EN_ROUTE]: 'Driver en route',
  [TripStatus.ACTIVE]: 'Trip in progress',
  [TripStatus.COMPLETED]: 'Completed',
  [TripStatus.CANCELLED]: 'Cancelled',
};

const RESUME_SCREENS: Partial<Record<TripStatus, keyof RootStackParamList>> = {
  [TripStatus.REQUESTED]: 'FindingDriver',
  [TripStatus.MATCHED]: 'DriverEnRoute',
  [TripStatus.EN_ROUTE]: 'DriverEnRoute',
  [TripStatus.ACTIVE]: 'TripActive',
};

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-NG', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function isActiveTrip(trip: Trip): boolean {
  return ACTIVE_STATUSES.includes(trip.status as TripStatus);
}

export function ActiveTrips({ navigation }: Props) {
  const { setCurrentTrip, setStatus, setDriverDetails, updateDriverLocation, setEta } =
    useTripStore();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resumingId, setResumingId] = useState<string | null>(null);

  const loadActiveTrips = useCallback(async (isRefresh = false) => {
    if (!isRefresh) {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await api.getTripHistory({ limit: 20 });
      const activeTrips = response.items.filter(isActiveTrip);
      setTrips(activeTrips);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load active trips';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadActiveTrips();
  }, [loadActiveTrips]);

  const handleResumeTrip = async (trip: Trip) => {
    const screen = RESUME_SCREENS[trip.status as TripStatus];
    if (!screen) return;

    setResumingId(trip.id);
    try {
      setCurrentTrip(trip);
      setStatus(trip.status as TripStatus);

      const statusInfo = await api.getTripStatus(trip.id);
      setStatus(statusInfo.status as TripStatus);
      if (statusInfo.driver) {
        setDriverDetails(statusInfo.driver);
      }
      if (statusInfo.driverLocation) {
        updateDriverLocation({
          lat: statusInfo.driverLocation.lat,
          lng: statusInfo.driverLocation.lng,
          bearing: statusInfo.driverLocation.bearing,
        });
        if (statusInfo.driverLocation.etaMin !== undefined) {
          setEta(statusInfo.driverLocation.etaMin);
        }
      }

      navigation.navigate(screen);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not resume trip';
      setError(message);
    } finally {
      setResumingId(null);
    }
  };

  const renderItem = ({ item }: { item: Trip }) => {
    const statusLabel = STATUS_LABELS[item.status as TripStatus] ?? item.status;
    const isResuming = resumingId === item.id;

    return (
      <Pressable
        style={styles.card}
        onPress={() => void handleResumeTrip(item)}
        disabled={isResuming}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
          <Text style={styles.status}>{statusLabel}</Text>
        </View>

        <View style={styles.route}>
          <Text style={styles.bullet} numberOfLines={1}>
            🟢 {item.pickupAddress}
          </Text>
          <Text style={styles.bullet} numberOfLines={1}>
            🔴 {item.destinationAddress}
          </Text>
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.vehicle}>🛺 {item.vehicleType.toUpperCase()}</Text>
          <Text style={styles.action}>{isResuming ? 'Opening…' : 'Resume ›'}</Text>
        </View>
      </Pressable>
    );
  };

  if (loading && trips.length === 0) {
    return (
      <ScreenShell title="Active Trips" scroll={false}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primaryGreen} />
        </View>
      </ScreenShell>
    );
  }

  if (error && trips.length === 0) {
    return (
      <ScreenShell title="Active Trips" scroll={false}>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <Button label="Retry" onPress={() => void loadActiveTrips()} />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title="Active Trips" subtitle="Trips currently in progress" scroll={false}>
      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      ) : null}

      <FlatList
        data={trips}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void loadActiveTrips(true)} />
        }
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyText}>No active trips right now.</Text>
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
    flexGrow: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: theme.spacing.md,
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
    color: theme.colors.accentOrange,
  },
  route: {
    gap: 4,
    marginVertical: theme.spacing.xs,
  },
  bullet: {
    fontSize: 13,
    color: theme.colors.darkNavy,
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
  vehicle: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.darkNavy,
  },
  action: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.primaryGreen,
  },
  emptyText: {
    fontSize: 15,
    color: '#9CA3AF',
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
});

export default ActiveTrips;