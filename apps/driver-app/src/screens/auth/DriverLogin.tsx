import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { ScreenShell } from '../../components/ScreenShell';
import { useDriverAuthStore } from '../../stores/driverAuthStore';
import { normalizeNigerianPhone } from '../../utils/phone';
import { theme } from '../../theme';
import type { DriverAuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<DriverAuthStackParamList, 'DriverLogin'>;

export function DriverLogin(_props: Props) {
  const { t } = useTranslation();
  const { sendOtp, verifyOtp, isLoading, error, clearError } =
    useDriverAuthStore();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phoneError, setPhoneError] = useState<string | undefined>();

  const normalized = normalizeNigerianPhone(phone);

  const handleSendOtp = async () => {
    clearError();
    if (!normalized) {
      setPhoneError(t('auth.invalidPhone'));
      return;
    }
    setPhoneError(undefined);
    try {
      await sendOtp(normalized);
      setStep('otp');
    } catch {
      // error in store
    }
  };

  const handleVerify = async () => {
    clearError();
    if (!normalized) return;
    try {
      await verifyOtp(normalized, otp.trim());
    } catch {
      // error in store
    }
  };

  return (
    <ScreenShell
      title={step === 'phone' ? t('auth.loginTitle') : t('auth.otpTitle')}
      subtitle={
        step === 'phone'
          ? t('auth.loginSubtitle')
          : t('auth.otpSubtitle', { phone: normalized ?? phone })
      }
    >
      {step === 'phone' ? (
        <>
          <Input
            label={t('auth.phoneLabel')}
            placeholder={t('auth.phonePlaceholder')}
            keyboardType="phone-pad"
            autoComplete="tel"
            value={phone}
            onChangeText={setPhone}
            error={phoneError}
          />
          <Button
            label={t('auth.sendOtp')}
            onPress={handleSendOtp}
            loading={isLoading}
          />
        </>
      ) : (
        <>
          <Input
            label="OTP"
            placeholder="123456"
            keyboardType="number-pad"
            maxLength={6}
            value={otp}
            onChangeText={setOtp}
          />
          <Button
            label={t('auth.verifyOtp')}
            onPress={handleVerify}
            loading={isLoading}
            disabled={otp.length < 6}
          />
          <View style={styles.resendRow}>
            <Text
              style={styles.resend}
              onPress={() => {
                setStep('phone');
                setOtp('');
              }}
            >
              {t('common.back')}
            </Text>
            <Text style={styles.resend} onPress={handleSendOtp}>
              {t('auth.resendOtp')}
            </Text>
          </View>
        </>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.md,
  },
  resend: {
    color: theme.colors.primaryGreen,
    fontWeight: '600',
    fontSize: 14,
  },
  error: {
    marginTop: theme.spacing.md,
    color: theme.colors.error,
    fontSize: 14,
  },
});