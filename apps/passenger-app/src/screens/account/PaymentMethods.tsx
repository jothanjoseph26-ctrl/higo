import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View, Pressable, Alert, Linking, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme';
import { ScreenShell } from '../../components/ScreenShell';
import { Button } from '../../components/Button';
import { useTripStore } from '../../stores/tripStore';
import { useAuthStore } from '../../stores/authStore';
import { PaymentMethod } from '@higo/shared-types';
import {
  getSavedCards,
  handlePaystackCallbackUrl,
  isPaystackConfigured,
  isPaystackTestMode,
  launchCardSaveIntent,
  type SavedCard,
} from '../../services/paystack';

export function PaymentMethods() {
  const { t } = useTranslation();
  const { paymentMethod, setPaymentMethod } = useTripStore();
  const { user } = useAuthStore();
  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [linkingCard, setLinkingCard] = useState(false);
  const [cardsLoading, setCardsLoading] = useState(true);

  const loadSavedCards = useCallback(async () => {
    setCardsLoading(true);
    const cards = await getSavedCards();
    setSavedCards(cards);
    setCardsLoading(false);
  }, []);

  const handlePaymentCallback = useCallback(
    async (url: string) => {
      const card = await handlePaystackCallbackUrl(url);
      if (card) {
        await loadSavedCards();
        setPaymentMethod(PaymentMethod.CARD);
        Alert.alert(
          'Card linked',
          isPaystackTestMode()
            ? `Test card saved (ref: ${card.reference}). Use Paystack test card 4084084084084081.`
            : `Your card was linked successfully (ref: ${card.reference}).`,
        );
      }
    },
    [loadSavedCards, setPaymentMethod],
  );

  useEffect(() => {
    void loadSavedCards();
  }, [loadSavedCards]);

  useEffect(() => {
    const processInitialUrl = async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        await handlePaymentCallback(initialUrl);
      }
    };
    void processInitialUrl();

    const subscription = Linking.addEventListener('url', (event) => {
      void handlePaymentCallback(event.url);
    });
    return () => subscription.remove();
  }, [handlePaymentCallback]);

  const resolvePayerEmail = (): string | null => {
    if (user?.email?.trim()) return user.email.trim();
    if (user?.phone?.trim()) return `${user.phone.trim()}@higo.com`;
    return null;
  };

  const handleAddCard = async () => {
    if (!isPaystackConfigured()) {
      Alert.alert(
        'Paystack not configured',
        'Add EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY (pk_test_…) to enable card linking in test mode.',
      );
      return;
    }

    const email = resolvePayerEmail();
    if (!email) {
      Alert.alert('Email required', 'Add an email to your profile before linking a debit card.');
      return;
    }

    setLinkingCard(true);
    try {
      const [firstName, ...rest] = (user?.name ?? 'HiGo Rider').split(' ');
      const lastName = rest.join(' ') || 'Passenger';
      await launchCardSaveIntent({
        email,
        firstName,
        lastName,
        phone: user?.phone,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not start Paystack checkout';
      Alert.alert('Card linking failed', message);
    } finally {
      setLinkingCard(false);
    }
  };

  const formatSavedCard = (card: SavedCard) => {
    const last4 = card.last4 ?? '••••';
    const brand = card.brand ?? 'Card';
    return `${brand} •••• ${last4}`;
  };

  return (
    <ScreenShell title="Payment Methods" subtitle="Configure how you pay for rides">
      {isPaystackTestMode() ? (
        <View style={styles.testBanner}>
          <Text style={styles.testBannerTitle}>Paystack test mode</Text>
          <Text style={styles.testBannerText}>
            Card linking uses live Paystack test checkout (₦1.00 verification). Use test card
            4084084084084081, any future expiry, CVV 408.
          </Text>
        </View>
      ) : null}

      {!isPaystackConfigured() ? (
        <View style={styles.warnBanner}>
          <Text style={styles.warnBannerTitle}>Paystack key missing</Text>
          <Text style={styles.warnBannerText}>
            Set EXPO_PUBLIC_PAYSTACK_PUBLIC_KEY to enable card linking.
          </Text>
        </View>
      ) : null}

      {cardsLoading ? (
        <View style={styles.cardsLoader}>
          <ActivityIndicator color={theme.colors.primaryGreen} />
        </View>
      ) : savedCards.length > 0 ? (
        <View style={styles.savedSection}>
          <Text style={styles.sectionTitle}>Linked cards</Text>
          {savedCards.map((card) => (
            <View key={card.reference} style={styles.savedCard}>
              <Text style={styles.savedCardIcon}>💳</Text>
              <View style={styles.savedCardDetails}>
                <Text style={styles.savedCardName}>{formatSavedCard(card)}</Text>
                <Text style={styles.savedCardSub}>Saved via Paystack · {card.reference}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

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
            <Text style={styles.sub}>Fast cashless charge via Paystack checkout</Text>
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
        label={linkingCard ? 'Opening Paystack…' : '+ Link New Debit Card'}
        onPress={() => void handleAddCard()}
        variant="outline"
        style={styles.btn}
        disabled={linkingCard}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  testBanner: {
    backgroundColor: 'rgba(11, 110, 79, 0.08)',
    borderWidth: 1,
    borderColor: theme.colors.primaryGreen,
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  testBannerTitle: {
    color: theme.colors.primaryGreen,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  testBannerText: {
    color: theme.colors.darkNavy,
    fontSize: 13,
    lineHeight: 18,
  },
  warnBanner: {
    backgroundColor: 'rgba(255, 122, 0, 0.1)',
    borderWidth: 1,
    borderColor: theme.colors.accentOrange,
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  warnBannerTitle: {
    color: theme.colors.accentOrange,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  warnBannerText: {
    color: theme.colors.darkNavy,
    fontSize: 13,
    lineHeight: 18,
  },
  savedSection: {
    marginBottom: theme.spacing.lg,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.darkNavy,
    marginBottom: 4,
  },
  savedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    backgroundColor: '#fff',
  },
  savedCardIcon: {
    fontSize: 22,
    marginRight: theme.spacing.md,
  },
  savedCardDetails: {
    flex: 1,
  },
  savedCardName: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.dark,
  },
  savedCardSub: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  cardsLoader: {
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
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