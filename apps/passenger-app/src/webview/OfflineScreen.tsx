import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

export function OfflineScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Can&apos;t reach HiGO</Text>
      <Text style={styles.subtitle}>Check your connection and try again.</Text>
      <Pressable style={styles.button} onPress={onRetry}>
        <Text style={styles.buttonText}>Retry</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.lightGrey,
    padding: theme.spacing.lg,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.dark,
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.dark,
    opacity: 0.6,
    marginBottom: theme.spacing.lg,
    textAlign: 'center',
  },
  button: {
    backgroundColor: theme.colors.primaryGreen,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.button,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
