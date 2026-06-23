import React, { useState } from 'react';
import { StyleSheet, Text, View, Pressable, Alert, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme';
import { Button } from '../../components/Button';
import { ScreenShell } from '../../components/ScreenShell';
import { useTripStore } from '../../stores/tripStore';
import { api } from '../../services/api';
import { initializePayment, pollPaymentStatus } from '../../services/paystack';
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
    setCurrentTrip,
    setStatus,
  } = useTripStore();

  const [booking, setBooking] = useState(false);
  const [paystackLoading, setPaystackLoading] = useState(false);

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
      // 1. If cashless payment, initialize Paystack flow first
      if (paymentMethod !== PaymentMethod.CASH) {
        setPaystackLoading(true);
        // Request booking pre-allocation or create first to get a trip ID
        // To be safe, we create the trip first or estimate.
        // Let's create the trip request to get the trip ID.
        const response = await api.requestTrip({
          pickup: { lat: pickup.lat, lng: pickup.lng },
          pickupAddress: pickup.address,
          destination: { lat: destination.lat, lng: destination.lng },
          destinationAddress: destination.address,
          vehicleType,
          paymentMethod,
          isShared,
        });

        const trip = response.trip;
        setCurrentTrip(trip);

        // Call Paystack initializer
        const payInit = await initializePayment({
          tripId: trip.id,
          paymentMethod,
        });

        // Simulate presenting the Paystack native SDK bottom sheet:
        Alert.alert(
          'Paystack Payment',
          `Initializing Paystack Sheet for ${paymentMethod.toUpperCase()}.\nReference: ${payInit.reference}\nAmount: ₦${(payInit.amount / 100).toFixed(2)}`,
          [
            {
              text: 'Cancel',
              onPress: () => {
                setBooking(false);
                setPaystackLoading(false);
              },
              style: 'cancel',
            },
            {
              text: 'Simulate Success (Approved)',
              onPress: () => {
                // Poll backend status to confirm payment transaction status
                pollPaymentStatus(trip.id, () => {
                  setPaystackLoading(false);
                  setBooking(false);
                  setStatus(TripStatus.REQUESTED);
                  navigation.navigate('FindingDriver');
                });
              },
            },
          ]
        );
      } else {
        // Cash payment flow - straight to request creation
        const response = await api.requestTrip({
          pickup: { lat: pickup.lat, lng: pickup.lng },
          pickupAddress: pickup.address,
          destination: { lat: destination.lat, lng: destination.lng },
          destinationAddress: destination.address,
          vehicleType,
          paymentMethod,
          isShared,
        });

        setCurrentTrip(response.trip);
        setStatus(TripStatus.REQUESTED);
        setBooking(false);
        navigation.navigate('FindingDriver');
      }
    } catch (err: any) {
      setBooking(false);
      setPaystackLoading(false);
      Alert.alert('Booking Failed', err.message || t('common.error'));
    }
  };

  const getPriceLabel = () => {
    if (!estimate) return '₦0.00';
    let multiplier = 1.0;
    if (isShared && vehicleType === 'keke') multiplier = 0.7;
    return `₦${((estimate.totalFare * multiplier) / 100).toFixed(2)}`;
  };

  return (
    <ScreenShell title="Confirm Booking" scroll={true}>
      <View style={styles.summary}>
        <Text style={styles.sectionTitle}>Ride Summary</Text>
        <View style={styles.row}>
          <Text style={styles.icon}>🛺</Text>
          <View>
            <Text style={styles.boldText}>HiGo {vehicleType.toUpperCase()}</Text>
            {isShared && <Text style={styles.subtext}>Shared ride active</Text>}
          </View>
          <Text style={styles.price}>{getPriceLabel()}</Text>
        </View>
      </View>

      <View style={styles.paymentSection}>
        <Text style={styles.sectionTitle}>{t('booking.paymentMethod')}</Text>
        
        <Pressable
          onPress={() => handleSelectPayment(PaymentMethod.CASH)}
          style={[styles.paymentBtn, paymentMethod === PaymentMethod.CASH && styles.activePayment]}
        >
          <Text style={styles.paymentIcon}>💵</Text>
          <Text style={styles.paymentText}>{t('booking.cash')}</Text>
        </Pressable>

        <Pressable
          onPress={() => handleSelectPayment(PaymentMethod.CARD)}
          style={[styles.paymentBtn, paymentMethod === PaymentMethod.CARD && styles.activePayment]}
        >
          <Text style={styles.paymentIcon}>💳</Text>
          <Text style={styles.paymentText}>{t('booking.card')}</Text>
        </Pressable>

        <Pressable
          onPress={() => handleSelectPayment(PaymentMethod.BANK)}
          style={[styles.paymentBtn, paymentMethod === PaymentMethod.BANK && styles.activePayment]}
        >
          <Text style={styles.paymentIcon}>🏦</Text>
          <Text style={styles.paymentText}>{t('booking.bank')}</Text>
        </Pressable>

        <Pressable
          onPress={() => handleSelectPayment(PaymentMethod.USSD)}
          style={[styles.paymentBtn, paymentMethod === PaymentMethod.USSD && styles.activePayment]}
        >
          <Text style={styles.paymentIcon}>📱</Text>
          <Text style={styles.paymentText}>{t('booking.ussd')}</Text>
        </Pressable>
      </View>

      {booking && (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.colors.primaryGreen} />
          <Text style={styles.loadingText}>
            {paystackLoading ? 'Processing cashless transaction...' : 'Booking your ride...'}
          </Text>
        </View>
      )}

      {!booking && (
        <Button
          label="Request Ride Now"
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
    fontSize: 28,
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
    fontSize: 20,
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
    fontSize: 20,
    marginRight: theme.spacing.md,
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
