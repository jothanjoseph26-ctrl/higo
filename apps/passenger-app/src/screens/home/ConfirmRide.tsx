import React, { useState } from 'react';
import { StyleSheet, Text, View, Pressable, Alert, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme';
import { Button } from '../../components/Button';
import { ScreenShell } from '../../components/ScreenShell';
import { useTripStore } from '../../stores/tripStore';
import { openTripPaymentCheckout, pollPaymentStatus } from '../../services/paystack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { PaymentMethod, TripStatus } from '@higo/shared-types';

type Props = NativeStackScreenProps<RootStackParamList, 'ConfirmRide'>;

export function ConfirmRide({ navigation }: Props) {
  const { t } = useTranslation();
  const {
    pickup,
    destination,
    vehicleType,
    paymentMethod,
    isShared,
    estimate,
    setPaymentMethod,
    setEstimate,
    setStatus,
    requestTrip,
  } = useTripStore();

  const [booking, setBooking] = useState(false);
  const [paymentPending, setPaymentPending] = useState(false);

  const handleSelectPayment = (method: PaymentMethod) => {
    setPaymentMethod(method);
  };

  const handleBook = async () => {
    if (!pickup || !destination || !estimate) {
      Alert.alert('Error', 'Invalid booking details. Please try again.');
      return;
    }

    setBooking(true);
    try {
      const response = await requestTrip();
      const trip = response.trip;
      setEstimate(response.estimate);
      setStatus(TripStatus.REQUESTED);

      if (paymentMethod === PaymentMethod.CASH) {
        setBooking(false);
        navigation.navigate('FindingDriver');
        return;
      }

      const checkout = await openTripPaymentCheckout({
        tripId: trip.id,
        paymentMethod,
      });

      setPaymentPending(true);
      setBooking(false);

      void pollPaymentStatus(
        trip.id,
        () => {
          setPaymentPending(false);
          setStatus(TripStatus.REQUESTED);
          navigation.navigate('FindingDriver');
        },
        (reason) => {
          setPaymentPending(false);
          const message =
            reason === 'failed'
              ? 'Payment was not completed. Your driver request was not dispatched.'
              : `We are still waiting for Paystack confirmation for reference ${checkout.reference}. Please do not request another ride until this payment resolves.`;
          Alert.alert('Payment not confirmed', message);
        },
        40,
        3000,
      );
    } catch (err: any) {
      setBooking(false);
      setPaymentPending(false);
      Alert.alert('Booking Failed', err.message || t('common.error'));
    }
  };

  const getPriceLabel = () => {
    if (!estimate) return 'NGN 0.00';
    return `NGN ${(estimate.totalFare / 100).toFixed(2)}`;
  };

  const isBusy = booking || paymentPending;

  return (
    <ScreenShell title="Confirm Booking" scroll={true}>
      <View style={styles.summary}>
        <Text style={styles.sectionTitle}>Ride Summary</Text>
        <View style={styles.row}>
          <Text style={styles.icon}>H</Text>
          <View style={styles.rideMeta}>
            <Text style={styles.boldText}>HiGO {vehicleType.toUpperCase()}</Text>
            {isShared && <Text style={styles.subtext}>Shared ride active</Text>}
          </View>
          <Text style={styles.price}>{getPriceLabel()}</Text>
        </View>
      </View>

      <View style={styles.paymentSection}>
        <Text style={styles.sectionTitle}>{t('booking.paymentMethod')}</Text>

        <Pressable
          onPress={() => handleSelectPayment(PaymentMethod.CASH)}
          disabled={isBusy}
          style={[styles.paymentBtn, paymentMethod === PaymentMethod.CASH && styles.activePayment]}
        >
          <Text style={styles.paymentIcon}>NGN</Text>
          <Text style={styles.paymentText}>{t('booking.cash')}</Text>
        </Pressable>

        <Pressable
          onPress={() => handleSelectPayment(PaymentMethod.CARD)}
          disabled={isBusy}
          style={[styles.paymentBtn, paymentMethod === PaymentMethod.CARD && styles.activePayment]}
        >
          <Text style={styles.paymentIcon}>CARD</Text>
          <Text style={styles.paymentText}>{t('booking.card')}</Text>
        </Pressable>

        <Pressable
          onPress={() => handleSelectPayment(PaymentMethod.BANK)}
          disabled={isBusy}
          style={[styles.paymentBtn, paymentMethod === PaymentMethod.BANK && styles.activePayment]}
        >
          <Text style={styles.paymentIcon}>BANK</Text>
          <Text style={styles.paymentText}>{t('booking.bank')}</Text>
        </Pressable>

        <Pressable
          onPress={() => handleSelectPayment(PaymentMethod.USSD)}
          disabled={isBusy}
          style={[styles.paymentBtn, paymentMethod === PaymentMethod.USSD && styles.activePayment]}
        >
          <Text style={styles.paymentIcon}>USSD</Text>
          <Text style={styles.paymentText}>{t('booking.ussd')}</Text>
        </Pressable>
      </View>

      {isBusy && (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.colors.primaryGreen} />
          <Text style={styles.loadingText}>
            {paymentPending
              ? 'Waiting for Paystack confirmation...'
              : paymentMethod === PaymentMethod.CASH
                ? 'Booking your ride...'
                : 'Opening secure checkout...'}
          </Text>
        </View>
      )}

      {!isBusy && (
        <Button
          label={paymentMethod === PaymentMethod.CASH ? 'Request Ride Now' : 'Pay & Request Ride'}
          onPress={handleBook}
          style={styles.bookBtn}
        />
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  summary: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.darkNavy,
    marginBottom: theme.spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E8F5EF',
    color: theme.colors.primaryGreen,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 34,
    textAlign: 'center',
  },
  rideMeta: {
    flex: 1,
    marginHorizontal: theme.spacing.md,
  },
  boldText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.darkNavy,
  },
  subtext: {
    fontSize: 12,
    color: theme.colors.primaryGreen,
    fontWeight: '600',
  },
  price: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.primaryGreen,
  },
  paymentSection: {
    gap: 10,
    marginBottom: theme.spacing.lg,
  },
  paymentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: theme.radius.input,
    padding: theme.spacing.md,
    backgroundColor: '#fff',
  },
  activePayment: {
    borderColor: theme.colors.primaryGreen,
    backgroundColor: 'rgba(11, 110, 79, 0.05)',
  },
  paymentIcon: {
    minWidth: 42,
    marginRight: theme.spacing.md,
    color: theme.colors.primaryGreen,
    fontSize: 12,
    fontWeight: '800',
  },
  paymentText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.dark,
  },
  bookBtn: {
    marginTop: theme.spacing.md,
    marginBottom: 40,
  },
  loadingWrap: {
    alignItems: 'center',
    marginVertical: theme.spacing.lg,
  },
  loadingText: {
    marginTop: 8,
    color: '#6B7280',
    fontSize: 14,
  },
});
