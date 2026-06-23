import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { theme } from '../../theme';
import type { DriverAuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<DriverAuthStackParamList, 'DriverSplash'>;

export function DriverSplash({ navigation }: Props) {
  const { t } = useTranslation();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigation.replace('DriverLogin');
    }, 1800);
    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>HiGo</Text>
      <Text style={styles.tagline}>{t('auth.splashTagline')}</Text>
      <Text style={styles.role}>Driver</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.darkNavy,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  logo: {
    fontSize: 48,
    fontWeight: '700',
    color: theme.colors.primaryGreen,
    marginBottom: theme.spacing.sm,
  },
  tagline: {
    fontSize: 18,
    color: '#E5E7EB',
    textAlign: 'center',
  },
  role: {
    marginTop: theme.spacing.md,
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.accentOrange,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
});