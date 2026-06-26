import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, Alert, Modal } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { KYCStatus } from '@higo/shared-types';
import { Button } from '../../components/Button';
import { ScreenShell } from '../../components/ScreenShell';
import { useDriverAuthStore } from '../../stores/driverAuthStore';
import { useOnlineStore } from '../../stores/onlineStore';
import { checkRestrictedGeofence, fetchAndCacheZones } from '../../services/geofence';
import { theme } from '../../theme';
import type { DriverMainStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<DriverMainStackParamList, 'Tab'>;

export function GoOnlineHome({ navigation }: { navigation: any }) {
  const { t } = useTranslation();
  const { driver, logout } = useDriverAuthStore();
  const {
    isOnline,
    isLoading,
    blockedReason,
    error,
    goOnline,
    goOffline,
    resetBlockedReason,
  } = useOnlineStore();
  const [restrictedZoneName, setRestrictedZoneName] = useState<string | null>(null);

  // Periodically fetch zones & check current geofence (mock driver location in Abuja)
  useEffect(() => {
    void fetchAndCacheZones();
    const interval = setInterval(async () => {
      if (isOnline) {
        // Mock driver location (e.g. Abuja center)
        const currentLoc = { lat: 9.0765, lng: 7.3986 };
        const zone = await checkRestrictedGeofence(currentLoc);
        if (zone) {
          setRestrictedZoneName(zone.name);
        } else {
          setRestrictedZoneName(null);
        }
      }
    }, 15_000);
    return () => clearInterval(interval);
  }, [isOnline]);

  const handleToggleOnline = async () => {
    if (isOnline) {
      await goOffline();
    } else {
      const ok = await goOnline();
      if (!ok && blockedReason) {
        // Trigger alert depending on block reason
        let title = 'Cannot Go Online';
        let msg = 'An error occurred. Contact support.';
        let target: keyof DriverMainStackParamList | null = null;

        if (blockedReason === 'KYC_INCOMPLETE') {
          title = 'KYC Incomplete';
          msg = 'Upload all documents before you go online.';
          target = 'DocumentStatus';
        } else if (blockedReason === 'SUBSCRIPTION_EXPIRED') {
          title = 'Subscription Expired';
          msg = 'Your subscription don expire. Renew to continue.';
          target = 'Subscription';
        } else if (blockedReason === 'DRIVER_SUSPENDED') {
          title = 'Account Suspended';
          msg = 'Your account don suspend. Contact support.';
          target = 'Support';
        }

        Alert.alert(title, msg, [
          { text: 'Cancel', style: 'cancel', onPress: resetBlockedReason },
          {
            text: target ? 'Fix Now' : 'OK',
            onPress: () => {
              resetBlockedReason();
              if (target) {
                navigation.navigate(target as any);
              }
            },
          },
        ]);
      }
    }
  };

  const kycApproved = driver?.kycStatus === KYCStatus.APPROVED;

  return (
    <ScreenShell
      title="HiGo Driver"
      subtitle={isOnline ? 'You are online — waiting for matches' : 'You are offline'}
    >
      {/* Geofence restricted alert banner */}
      {restrictedZoneName && (
        <View style={styles.geofenceAlert}>
          <Text style={styles.geofenceAlertText}>
            ⚠️ Restricted Area: You cannot accept trip requests inside {restrictedZoneName}.
          </Text>
        </View>
      )}

      {!kycApproved ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>Complete KYC verification to start matches</Text>
          <Button
            label="View Documents"
            onPress={() => navigation.navigate('DocumentStatus')}
            variant="secondary"
            style={styles.bannerBtn}
          />
        </View>
      ) : (
        <View style={styles.onlineCard}>
          <Text style={styles.statusTitle}>Driver Status</Text>
          <Text style={[styles.statusText, isOnline ? styles.online : styles.offline]}>
            {isOnline ? 'ONLINE' : 'OFFLINE'}
          </Text>

          {isLoading ? (
            <ActivityIndicator size="large" color={theme.colors.primaryGreen} style={styles.loader} />
          ) : (
            <Button
              label={isOnline ? 'Go Offline' : 'Go Online'}
              onPress={handleToggleOnline}
              style={isOnline ? styles.goOfflineBtn : styles.goOnlineBtn}
            />
          )}
        </View>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: theme.colors.accentOrange,
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  bannerText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: theme.spacing.sm,
  },
  bannerBtn: {
    backgroundColor: '#fff',
  },
  onlineCard: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
    ...theme.shadow.sm,
  },
  statusTitle: {
    fontSize: 13,
    color: '#6B7280',
    textTransform: 'uppercase',
  },
  statusText: {
    fontSize: 32,
    fontWeight: '700',
    marginVertical: theme.spacing.sm,
  },
  online: {
    color: theme.colors.primaryGreen,
  },
  offline: {
    color: '#9CA3AF',
  },
  loader: {
    height: 48,
    justifyContent: 'center',
  },
  goOnlineBtn: {
    backgroundColor: theme.colors.primaryGreen,
    width: '100%',
  },
  goOfflineBtn: {
    backgroundColor: '#6B7280',
    width: '100%',
  },
  geofenceAlert: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    padding: theme.spacing.md,
    borderRadius: theme.radius.card,
    marginBottom: theme.spacing.md,
  },
  geofenceAlertText: {
    color: '#7F1D1D',
    fontSize: 13,
    fontWeight: '600',
  },
  error: {
    color: theme.colors.error,
    fontSize: 14,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
  },
});