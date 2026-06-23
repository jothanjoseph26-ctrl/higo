import React, { useState } from 'react';
import { StyleSheet, Text, View, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { ScreenShell } from '../../components/ScreenShell';
import { useAuthStore } from '../../stores/authStore';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'SignUp'>;

export function SignUp({ navigation }: Props) {
  const { t } = useTranslation();
  const { updateProfile, isLoading, error } = useAuthStore();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  const handleSignUp = async () => {
    if (!name || name.trim().length === 0) {
      Alert.alert('Error', 'Please enter your full name');
      return;
    }
    if (!email || !email.includes('@')) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    try {
      await updateProfile({
        name,
        email,
        preferredLanguage: 'en', // Default language to English, can be changed in Profile
      });
      // Authenticated! RootStack will auto-switch to Main.
    } catch (err: any) {
      Alert.alert('Registration Failed', err.message || t('common.error'));
    }
  };

  return (
    <ScreenShell
      title={t('auth.signUpTitle')}
      subtitle={t('auth.signUpSubtitle')}
    >
      <View style={styles.form}>
        <Input
          label={t('auth.fullNameLabel')}
          placeholder={t('auth.fullNamePlaceholder')}
          value={name}
          onChangeText={setName}
          editable={!isLoading}
        />
        <Input
          label={t('auth.emailLabel')}
          placeholder={t('auth.emailPlaceholder')}
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
          editable={!isLoading}
        />

        {error && <Text style={styles.errorText}>{error}</Text>}

        <Button
          label={t('auth.submit')}
          onPress={handleSignUp}
          loading={isLoading}
          style={styles.submitBtn}
        />
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  form: {
    marginTop: theme.spacing.xl,
  },
  submitBtn: {
    marginTop: theme.spacing.lg,
  },
  errorText: {
    color: theme.colors.error,
    fontSize: 14,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
});
