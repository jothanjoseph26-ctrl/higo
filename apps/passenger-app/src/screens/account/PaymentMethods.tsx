import React from 'react';
import { StyleSheet, Text, View, Pressable, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme';
import { ScreenShell } from '../../components/ScreenShell';
import { Button } from '../../components/Button';
import { useTripStore } from '../../stores/tripStore';
import { PaymentMethod } from '@higo/shared-types';

export function PaymentMethods() {
  const { t } = useTranslation();
  const { paymentMethod, setPaymentMethod } = useTripStore();

  const handleAddCard = () => {
    Alert.alert('Add Card', 'Card additions are simulated for local testing. We support Paystack integrations.');
  };

  return (
    <ScreenShell title="Payment Methods" subtitle="Configure how you pay for rides">
      <View style={styles.list}>
        <Pressable
          onPress={() => setPaymentMethod(PaymentMethod.CASH)}
          style={[styles.item, paymentMethod === PaymentMethod.CASH && styles.active]}
        >
          <Text style={styles.icon}>💵</Text>
          <View style={styles.details}>
            <Text style={styles.name}>{t('booking.cash')}</Text>
            <Text style={styles.sub}>Pay the driver with cash at trip end</Text>
          </View>
          {paymentMethod === PaymentMethod.CASH && <Text style={styles.check}>✓</Text>}
        </Pressable>

        <Pressable
          onPress={() => setPaymentMethod(PaymentMethod.CARD)}
          style={[styles.item, paymentMethod === PaymentMethod.CARD && styles.active]}
        >
          <Text style={styles.icon}>💳</Text>
          <View style={styles.details}>
            <Text style={styles.name}>{t('booking.card')}</Text>
            <Text style={styles.sub}>Fast cashless charge via Paystack SDK</Text>
          </View>
          {paymentMethod === PaymentMethod.CARD && <Text style={styles.check}>✓</Text>}
        </Pressable>

        <Pressable
          onPress={() => setPaymentMethod(PaymentMethod.BANK)}
          style={[styles.item, paymentMethod === PaymentMethod.BANK && styles.active]}
        >
          <Text style={styles.icon}>🏦</Text>
          <View style={styles.details}>
            <Text style={styles.name}>{t('booking.bank')}</Text>
            <Text style={styles.sub}>Bank transfer checkout option</Text>
          </View>
          {paymentMethod === PaymentMethod.BANK && <Text style={styles.check}>✓</Text>}
        </Pressable>

        <Pressable
          onPress={() => setPaymentMethod(PaymentMethod.USSD)}
          style={[styles.item, paymentMethod === PaymentMethod.USSD && styles.active]}
        >
          <Text style={styles.icon}>📱</Text>
          <View style={styles.details}>
            <Text style={styles.name}>{t('booking.ussd')}</Text>
            <Text style={styles.sub}>USSD payment checkout option</Text>
          </View>
          {paymentMethod === PaymentMethod.USSD && <Text style={styles.check}>✓</Text>}
        </Pressable>
      </View>

      <Button
        label="+ Link New Debit Card"
        onPress={handleAddCard}
        variant="outline"
        style={styles.btn}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 12,
    marginBottom: theme.spacing.lg,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    backgroundColor: '#fff',
  },
  active: {
    borderColor: theme.colors.primaryGreen,
    backgroundColor: 'rgba(11, 110, 79, 0.05)',
  },
  icon: {
    fontSize: 24,
    marginRight: theme.spacing.md,
  },
  details: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.dark,
  },
  sub: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  check: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.primaryGreen,
    marginLeft: theme.spacing.sm,
  },
  btn: {
    marginTop: theme.spacing.md,
  },
});
