import React, { useState } from 'react';
import { StyleSheet, Text, View, Alert, ScrollView, Modal } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SubscriptionTier } from '@higo/shared-types';
import { api } from '../../services/api';
import { useDriverAuthStore } from '../../stores/driverAuthStore';
import { Button } from '../../components/Button';
import { getUssdInstructions, USSD_CODES } from '../../services/ussd';
import { theme } from '../../theme';

export function Subscription() {
  const { t } = useTranslation();
  const { driver } = useDriverAuthStore();
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier>(SubscriptionTier.DAILY);
  const [isLoading, setIsLoading] = useState(false);
  const [showUssdModal, setShowUssdModal] = useState(false);
  const [selectedBank, setSelectedBank] = useState<string>('GTBank');
  const [ussdInstructions, setUssdInstructions] = useState('');

  const prices = {
    [SubscriptionTier.DAILY]: 500,
    [SubscriptionTier.WEEKLY]: 3000,
    [SubscriptionTier.MONTHLY]: 10000,
  };

  const handleSubscribePaystack = async () => {
    setIsLoading(true);
    try {
      const amountKobo = prices[selectedTier] * 100;
      // 1. Initialize subscription payment
      const response = await api.request<{
        subscriptionId: string;
        authorizationUrl: string;
        reference: string;
      }>({
        method: 'POST',
        url: '/payments/subscription',
        data: { tier: selectedTier, amount: amountKobo },
      });

      // Simulating loading the payment sheet or authorization URL
      Alert.alert(
        'Payment Sheet Opened',
        `Paystack sheet for HiconnectGo Subscription.\nReference: ${response.reference}`,
        [
          {
            text: 'Simulate Success',
            onPress: async () => {
              Alert.alert('Success', 'Subscription purchased successfully!');
            },
          },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    } catch (err: any) {
      console.error('Subscription error:', err);
      // Trigger USSD fallback if network/payment fails
      handleTriggerUssdFallback();
    } finally {
      setIsLoading(false);
    }
  };

  const handleTriggerUssdFallback = () => {
    const amountNgn = prices[selectedTier];
    const reference = `SUB-${Date.now().toString().slice(-6)}`;
    const instructions = getUssdInstructions(selectedBank, amountNgn, reference);
    setUssdInstructions(instructions);
    setShowUssdModal(true);
  };

  const handleBankChange = (bank: string) => {
    setSelectedBank(bank);
    const amountNgn = prices[selectedTier];
    const reference = `SUB-${Date.now().toString().slice(-6)}`;
    const instructions = getUssdInstructions(bank, amountNgn, reference);
    setUssdInstructions(instructions);
  };

  const hasSubscription = driver?.subscriptionExpiresAt
    ? new Date(driver.subscriptionExpiresAt) > new Date()
    : false;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Subscription</Text>

      {/* Current Status */}
      <View style={styles.card}>
        <Text style={styles.statusLabel}>Current Subscription Status</Text>
        <Text style={[styles.statusText, hasSubscription ? styles.active : styles.expired]}>
          {hasSubscription ? 'ACTIVE' : 'EXPIRED'}
        </Text>
        {driver?.subscriptionExpiresAt && (
          <Text style={styles.expiryDate}>
            Expires: {new Date(driver.subscriptionExpiresAt).toLocaleDateString()}
          </Text>
        )}
      </View>

      {/* Select Tier */}
      <Text style={styles.sectionTitle}>Select Plan</Text>
      <View style={styles.tiersWrapper}>
        {(Object.keys(prices) as SubscriptionTier[]).map((tier) => (
          <View
            key={tier}
            style={[styles.tierCard, selectedTier === tier && styles.selectedTierCard]}
          >
            <Text style={styles.tierName}>{tier.toUpperCase()}</Text>
            <Text style={styles.tierPrice}>NGN {prices[tier]}</Text>
            <Button
              label={selectedTier === tier ? 'Selected' : 'Select'}
              onPress={() => setSelectedTier(tier)}
              variant={selectedTier === tier ? 'primary' : 'outline'}
              style={styles.selectBtn}
            />
          </View>
        ))}
      </View>

      <Button
        label={isLoading ? 'Processing…' : 'Pay via Paystack'}
        onPress={handleSubscribePaystack}
        loading={isLoading}
        style={styles.payBtn}
      />

      <Button
        label="Offline USSD Fallback"
        onPress={handleTriggerUssdFallback}
        variant="outline"
        style={styles.ussdBtn}
      />

      {/* USSD Fallback Modal */}
      <Modal visible={showUssdModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>USSD Bank Payment</Text>
            <Text style={styles.modalSubtitle}>Select your bank to generate code</Text>

            <View style={styles.banksRow}>
              {USSD_CODES.map((u) => (
                <Button
                  key={u.bank}
                  label={u.bank}
                  onPress={() => handleBankChange(u.bank)}
                  variant={selectedBank === u.bank ? 'primary' : 'outline'}
                  style={styles.bankBtn}
                />
              ))}
            </View>

            <View style={styles.instructionsContainer}>
              <Text style={styles.instructionsText}>{ussdInstructions}</Text>
            </View>

            <View style={styles.modalActions}>
              <Button label="Close" onPress={() => setShowUssdModal(false)} variant="secondary" />
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.lightGrey,
  },
  content: {
    padding: theme.spacing.md,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.darkNavy,
    marginBottom: theme.spacing.md,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadow.sm,
  },
  statusLabel: {
    fontSize: 12,
    color: '#6B7280',
    textTransform: 'uppercase',
  },
  statusText: {
    fontSize: 24,
    fontWeight: '700',
    marginVertical: 4,
  },
  active: {
    color: theme.colors.primaryGreen,
  },
  expired: {
    color: theme.colors.error,
  },
  expiryDate: {
    fontSize: 13,
    color: '#4B5563',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.darkNavy,
    marginBottom: theme.spacing.sm,
  },
  tiersWrapper: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  tierCard: {
    width: '31%',
    backgroundColor: '#fff',
    borderRadius: theme.radius.card,
    padding: theme.spacing.sm,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    ...theme.shadow.sm,
  },
  selectedTierCard: {
    borderColor: theme.colors.primaryGreen,
  },
  tierName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  tierPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.darkNavy,
    marginVertical: 8,
  },
  selectBtn: {
    height: 32,
    paddingVertical: 0,
    width: '100%',
  },
  payBtn: {
    marginTop: theme.spacing.md,
  },
  ussdBtn: {
    marginTop: theme.spacing.sm,
    borderColor: theme.colors.accentOrange,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: theme.radius.card,
    borderTopRightRadius: theme.radius.card,
    padding: theme.spacing.md,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.darkNavy,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: theme.spacing.md,
  },
  banksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: theme.spacing.md,
  },
  bankBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  bankBtnText: {
    fontSize: 12,
  },
  instructionsContainer: {
    backgroundColor: '#F3F4F6',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  instructionsText: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.darkNavy,
  },
  modalActions: {
    marginTop: theme.spacing.sm,
  },
});
