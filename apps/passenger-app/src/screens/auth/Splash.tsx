import React, { useEffect } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, Image } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme';
import { useAuthStore } from '../../stores/authStore';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Splash'>;

export function Splash({ navigation }: Props) {
  const { t } = useTranslation();
  const { isAuthenticated, isHydrated, hydrate } = useAuthStore();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (isHydrated) {
      // Simulate splash display delay
      const timer = setTimeout(() => {
        if (isAuthenticated) {
          // Navigated by RootStack automatically if authenticated
        } else {
          navigation.replace('Onboard1');
        }
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isHydrated, isAuthenticated, navigation]);

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>🛺 HiGo</Text>
      <Text style={styles.tagline}>{t('auth.splashTagline')}</Text>
      <ActivityIndicator size="large" color="#fff" style={styles.loader} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.primaryGreen,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  logo: {
    fontSize: 48,
    fontWeight: '800',
    color: '#fff',
    marginBottom: theme.spacing.sm,
  },
  tagline: {
    fontSize: 16,
    color: '#E5E7EB',
    textAlign: 'center',
    fontWeight: '500',
  },
  loader: {
    marginTop: 40,
  },
});
