import React, { useEffect } from 'react';
import { StyleSheet, Text, View, Image } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { theme } from '../../theme';
import type { DriverAuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<DriverAuthStackParamList, 'DriverSplash'>;

export function DriverSplash({ navigation }: Props) {
  const { t } = useTranslation();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigation.replace('LocationPermission');
    }, 1800);
    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/logo-rectangular-dark.png')}
        style={styles.logoImage}
        resizeMode="contain"
      />
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
  logoImage: {
    width: 240,
    height: 130,
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