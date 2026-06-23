import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, SafeAreaView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme';
import { MapView } from '../../components/MapView';
import { Banner } from '../../components/Banner';
import { useLocationStore } from '../../stores/locationStore';
import { useTripStore } from '../../stores/tripStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { OfflineManager } from '../../services/offline';
import { connectSocket } from '../../services/socket';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Main'>;

export function Home({ navigation }: any) {
  const { t } = useTranslation();
  const { userLocation, requestPermission, watch } = useLocationStore();
  const { currentTrip, status, driverLocation, driverBearing } = useTripStore();
  const { unreadCount } = useNotificationStore();
  const [isOffline, setIsOffline] = useState(!OfflineManager.getIsConnected());

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

  // Navigate to current trip details if a trip is active
  useEffect(() => {
    if (status && status !== 'cancelled' && status !== 'completed') {
      navigation.navigate('TripActive');
    }
  }, [status, navigation]);

  return (
    <View style={styles.container}>
      <Banner
        message={t('common.offline')}
        type="warning"
        visible={isOffline}
      />

      <MapView
        pickup={userLocation}
        driverLocation={driverLocation}
        driverBearing={driverBearing}
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
