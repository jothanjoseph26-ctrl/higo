import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../../theme';
import { Button } from '../../components/Button';
import { OfflineManager } from '../../services/offline';

interface OfflineScreenProps {
  onRetry?: () => void;
}

export function OfflineScreen({ onRetry }: OfflineScreenProps) {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const connected = await OfflineManager.checkConnection();
      if (connected) {
        onRetry?.();
      }
    } finally {
      setRetrying(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>📡</Text>
      <Text style={styles.title}>You&apos;re offline</Text>
      <Text style={styles.body}>
        Check your mobile data or Wi-Fi connection. We&apos;ll restore booking and live trip
        updates once you&apos;re back online.
      </Text>
      <Button
        label="Try again"
        onPress={() => void handleRetry()}
        loading={retrying}
        style={styles.retryBtn}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.lightGrey,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  icon: {
    fontSize: 56,
    marginBottom: theme.spacing.md,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.darkNavy,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: theme.spacing.lg,
  },
  retryBtn: {
    minWidth: 200,
  },
});

export default OfflineScreen;