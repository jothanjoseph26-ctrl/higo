import React, { useState, useEffect } from 'react';
import { Platform, StyleSheet, Text, View, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { ScreenShell } from '../../components/ScreenShell';
import { useAuthStore } from '../../stores/authStore';
import { normalizeNigerianPhone } from '../../utils/phone';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function Login({ navigation }: Props) {
  const { t } = useTranslation();
  const { sendOtp, verifyOtp, isLoading, error, clearError } = useAuthStore();

  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    return () => {
      clearError();
    };
  }, [clearError]);

  useEffect(() => {
    let timer: any;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [countdown]);

  const normalizedPhone = normalizeNigerianPhone(phone);

  const handleSendOtp = async () => {
    if (!normalizedPhone) {
      Alert.alert('Error', t('auth.invalidPhone'));
      return;
    }

    try {
      await sendOtp(normalizedPhone);
      setStep('otp');
      setCountdown(60); // 1-minute resend lockout
    } catch (err: any) {
      Alert.alert('Failed to send OTP', err.message || t('common.error'));
    }
  };

  const handleVerifyOtp = async () => {
    if (code.length !== 6) {
      Alert.alert('Error', 'Please enter a valid 6-digit code');
      return;
    }

    try {
      if (!normalizedPhone) {
        Alert.alert('Error', t('auth.invalidPhone'));
        return;
      }

      const isNewUser = await verifyOtp(normalizedPhone, code);
      if (isNewUser) {
        navigation.navigate('SignUp');
      } else {
        // Authenticated! RootStack will auto-switch to Main
      }
    } catch (err: any) {
      Alert.alert('Verification Failed', err.message || 'Invalid code');
    }
  };

  const formatCountdown = () => {
    const minutes = Math.floor(countdown / 60);
    const seconds = countdown % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  return (
    <ScreenShell
      title={step === 'phone' ? t('auth.loginTitle') : t('auth.otpTitle')}
      subtitle={
        step === 'phone'
          ? t('auth.loginSubtitle')
          : t('auth.otpSubtitle', { phone: normalizedPhone ?? phone })
      }
      scroll={false}
    >
      <View style={styles.form}>
        {step === 'phone' ? (
          <>
            <Input
              label={t('auth.phoneLabel')}
              placeholder={t('auth.phonePlaceholder')}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              editable={!isLoading}
            />
            {error && <Text style={styles.errorText}>{error}</Text>}
            {Platform.OS === 'web' ? (
              <View nativeID="firebase-recaptcha" style={styles.recaptchaHost} />
            ) : null}
            <Button
              label={t('auth.sendOtp')}
              onPress={handleSendOtp}
              loading={isLoading}
              style={styles.submitBtn}
            />
          </>
        ) : (
          <>
            <Input
              label="Verification Code"
              placeholder="123456"
              keyboardType="number-pad"
              maxLength={6}
              value={code}
              onChangeText={setCode}
              editable={!isLoading}
            />
            {error && <Text style={styles.errorText}>{error}</Text>}
            <Button
              label={t('auth.verifyOtp')}
              onPress={handleVerifyOtp}
              loading={isLoading}
              style={styles.submitBtn}
            />

            <View style={styles.resendRow}>
              {countdown > 0 ? (
                <Text style={styles.countdownText}>
                  Resend code in {formatCountdown()} (valid 5 min)
                </Text>
              ) : (
                <Button
                  label={t('auth.resendOtp')}
                  onPress={handleSendOtp}
                  variant="outline"
                  disabled={isLoading}
                  style={styles.resendBtn}
                />
              )}
            </View>
          </>
        )}
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  form: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 60,
  },
  submitBtn: {
    marginTop: theme.spacing.md,
  },
  resendRow: {
    marginTop: theme.spacing.lg,
    alignItems: 'center',
  },
  countdownText: {
    fontSize: 14,
    color: '#6B7280',
  },
  resendBtn: {
    width: '100%',
  },
  errorText: {
    color: theme.colors.error,
    fontSize: 14,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  recaptchaHost: {
    minHeight: 78,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
