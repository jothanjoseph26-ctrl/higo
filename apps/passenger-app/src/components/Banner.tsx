import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

interface BannerProps {
  message: string;
  type?: 'warning' | 'info' | 'error';
  visible?: boolean;
}

export function Banner({ message, type = 'warning', visible = true }: BannerProps) {
  if (!visible) return null;

  return (
    <View
      style={[
        styles.banner,
        type === 'warning' && styles.warning,
        type === 'error' && styles.error,
        type === 'info' && styles.info,
      ]}
    >
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    width: '100%',
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 999,
  },
  warning: {
    backgroundColor: theme.colors.accentOrange,
  },
  error: {
    backgroundColor: theme.colors.error,
  },
  info: {
    backgroundColor: theme.colors.darkNavy,
  },
  text: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
