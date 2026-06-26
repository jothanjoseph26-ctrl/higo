import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { theme } from '../../theme';
import { Button } from '../../components/Button';
import { registerFCM, requestNotificationPermission } from '../../services/fcm';
import type { DriverAuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<DriverAuthStackParamList, 'NotificationPermission'>;

export function NotificationPermission({ navigation }: Props) {
  const [loading, setLoading] = useState(false);

  const continueToLogin = useCallback(() => {
    navigation.navigate('DriverLogin');
  }, [navigation]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      continueToLogin();
    }
  }, [continueToLogin]);

  const handleEnable = async () => {
    setLoading(true);
    try {
      const granted = await requestNotificationPermission();
      if (granted) {
        await registerFCM();
      }
      continueToLogin();
    } finally {
      setLoading(false);
    }
  };

  if (Platform.OS === 'web') {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.illustration}>🔔</Text>
        <Text style={styles.title}>Never Miss a Ride Request</Text>
        <Text style={styles.subtitle}>
          Turn on notifications to get instant alerts for new trips, passenger
          messages, and important account updates while you are online.
        </Text>
      </View>

      <View style={styles.footer}>
        <Button
          label="Enable Notifications"
          onPress={() => void handleEnable()}
          loading={loading}
        />
        <Pressable onPress={continueToLogin} style={styles.skipButton}>
          <Text style={styles.skipLabel}>Skip for now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.lightGrey,
    padding: theme.spacing.lg,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  illustration: {
    fontSize: 100,
    marginBottom: theme.spacing.xl,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.darkNavy,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },
  subtitle: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  footer: {
    gap: theme.spacing.md,
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
  },
  skipLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
});