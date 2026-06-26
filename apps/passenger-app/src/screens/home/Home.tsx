import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, SafeAreaView, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme';
import { MapView } from '../../components/MapView';
import { OfflineScreen } from '../account/OfflineScreen';
import { useLocationStore } from '../../stores/locationStore';
import { useTripStore } from '../../stores/tripStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { OfflineManager } from '../../services/offline';
import { connectSocket } from '../../services/socket';
import { TripStatus, type NearbyDriver, type Trip } from '@higo/shared-types';
import { api } from '../../services/api';

const ACTIVE_TRIP_STATUSES: TripStatus[] = [
  TripStatus.REQUESTED,
  TripStatus.MATCHED,
  TripStatus.EN_ROUTE,
  TripStatus.ACTIVE,
];

const NEARBY_DRIVERS_POLL_MS = 30_000;

function isMapsMock(): boolean {
  if (Platform.OS === 'web') return true;
  return process.env.EXPO_PUBLIC_MAPS_MOCK === 'true';
}

export function Home({ navigation }: any) {
  const { t } = useTranslation();
  const { userLocation, requestPermission, watch } = useLocationStore();
  const { status, driverLocation } = useTripStore();
  const { unreadCount } = useNotificationStore();
  const [isOffline, setIsOffline] = useState(!OfflineManager.getIsConnected());
  const [nearbyDrivers, setNearbyDrivers] = useState<NearbyDriver[]>([]);
  const [activeTripCount, setActiveTripCount] = useState(0);

  useEffect(() => {
    // Connect websocket client and start location watching
    void connectSocket();
    void requestPermission().then((granted) => {
      if (granted) {
        watch();
      }
    });

    const removeOfflineListener = OfflineManager.addListener((connected) => {
      setIsOffline(!connected);
    });

    return () => {
      removeOfflineListener();
    };
  }, [requestPermission, watch]);

  useEffect(() => {
    let cancelled = false;

    const fetchActiveTripCount = () => {
      void api
        .getTripHistory({ limit: 20 })
        .then((response) => {
          if (cancelled) return;
          const count = response.items.filter((trip: Trip) =>
            ACTIVE_TRIP_STATUSES.includes(trip.status as TripStatus),
          ).length;
          setActiveTripCount(count);
        })
        .catch(() => {
          if (!cancelled) {
            setActiveTripCount(0);
          }
        });
    };

    fetchActiveTripCount();
    const intervalId = setInterval(fetchActiveTripCount, NEARBY_DRIVERS_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  // Resume active trip flow when returning to home with an in-progress trip
  useEffect(() => {
    if (!status || status === TripStatus.CANCELLED || status === TripStatus.COMPLETED) {
      return;
    }

    const resumeScreen: Record<string, string> = {
      [TripStatus.REQUESTED]: 'FindingDriver',
      [TripStatus.MATCHED]: 'DriverEnRoute',
      [TripStatus.EN_ROUTE]: 'DriverEnRoute',
      [TripStatus.ACTIVE]: 'TripActive',
    };

    const screen = resumeScreen[status];
    if (screen) {
      navigation.navigate(screen);
    }
  }, [status, navigation]);

  useEffect(() => {
    if (isMapsMock() || !userLocation) {
      setNearbyDrivers([]);
      return;
    }

    let cancelled = false;

    const fetchNearbyDrivers = () => {
      void api
        .getNearbyDrivers(userLocation.lat, userLocation.lng, 5)
        .then((result) => {
          if (!cancelled) {
            setNearbyDrivers(result.drivers);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setNearbyDrivers([]);
          }
        });
    };

    fetchNearbyDrivers();
    const intervalId = setInterval(fetchNearbyDrivers, NEARBY_DRIVERS_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [userLocation?.lat, userLocation?.lng]);

  if (isOffline) {
    return (
      <OfflineScreen
        onRetry={() => {
          if (OfflineManager.getIsConnected()) {
            setIsOffline(false);
          }
        }}
      />
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        pickup={userLocation}
        driverLocation={driverLocation}
        driverBearing={driverLocation?.bearing}
        nearbyDrivers={nearbyDrivers}
      />

      <SafeAreaView style={styles.overlay}>
        <View style={styles.topRow}>
          <Pressable
            onPress={() => navigation.navigate('Notifications')}
            style={styles.circleBtn}
          >
            <Text style={styles.btnIcon}>🔔</Text>
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount}</Text>
              </View>
            )}
          </Pressable>

          <Pressable
            onPress={() => navigation.navigate('SOS')}
            style={[styles.circleBtn, styles.sosBtn]}
          >
            <Text style={[styles.btnIcon, styles.sosIcon]}>🚨</Text>
          </Pressable>
        </View>

        <View style={styles.bottomContainer}>
          {activeTripCount > 1 ? (
            <Pressable
              onPress={() => navigation.navigate('ActiveTrips')}
              style={styles.activeTripsBanner}
            >
              <Text style={styles.activeTripsText}>
                🚕 {activeTripCount} active trips — tap to view all
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={() => navigation.navigate('Booking')}
            style={styles.searchBar}
          >
            <Text style={styles.searchIcon}>🔍</Text>
            <Text style={styles.searchText}>{t('booking.whereTo')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    padding: theme.spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 60,
  },
  circleBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.darkNavy,
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 5,
    position: 'relative',
  },
  sosBtn: {
    backgroundColor: theme.colors.error,
  },
  btnIcon: {
    fontSize: 20,
  },
  sosIcon: {
    color: '#fff',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: theme.colors.accentOrange,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  bottomContainer: {
    width: '100%',
    paddingBottom: 20,
    gap: theme.spacing.sm,
  },
  activeTripsBanner: {
    backgroundColor: theme.colors.darkNavy,
    borderRadius: theme.radius.card,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  activeTripsText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: theme.radius.card,
    paddingVertical: 16,
    paddingHorizontal: 20,
    shadowColor: theme.colors.darkNavy,
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#F2F4F7',
  },
  searchIcon: {
    fontSize: 20,
    marginRight: theme.spacing.sm,
  },
  searchText: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '500',
  },
});
