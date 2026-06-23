import React from 'react';
import { StyleSheet, Text, View, Image } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme';
import { Button } from '../../components/Button';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Onboard1'>;

export function Onboard1({ navigation }: Props) {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.illustration}>🛺</Text>
        <Text style={styles.title}>{t('auth.onboard1Title')}</Text>
        <Text style={styles.subtitle}>{t('auth.onboard1Subtitle')}</Text>
      </View>
      
      <View style={styles.footer}>
        <View style={styles.dots}>
          <View style={[styles.dot, styles.activeDot]} />
          <View style={styles.dot} />
          <View style={styles.dot} />
        </View>
        <Button
          label={t('common.continue')}
          onPress={() => navigation.navigate('Onboard2')}
        />
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
    gap: theme.spacing.lg,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D1D5DB',
  },
  activeDot: {
    width: 24,
    backgroundColor: theme.colors.primaryGreen,
  },
});
