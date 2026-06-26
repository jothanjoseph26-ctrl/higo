import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';
import { Button } from './Button';

/** MVP flat cancellation fee shown in policy copy (₦200). */
export const MVP_CANCELLATION_FEE_KOBO = 20_000;

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toFixed(2)}`;
}

interface CancellationFeeModalProps {
  visible: boolean;
  feeKobo?: number;
  onConfirm: () => void;
  onDismiss: () => void;
  loading?: boolean;
}

export function CancellationFeeModal({
  visible,
  feeKobo = MVP_CANCELLATION_FEE_KOBO,
  onConfirm,
  onDismiss,
  loading,
}: CancellationFeeModalProps) {
  const feeText = formatNaira(feeKobo);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Cancel ride request?</Text>
          <Text style={styles.policy}>
            Cancellation policy: while we are still searching for a driver, cancellation is free.
            If a driver has already accepted your trip, a flat fee of {feeText} may apply.
          </Text>
          <Text style={styles.note}>
            By confirming, you agree to HiGo&apos;s cancellation terms.
          </Text>

          <View style={styles.actions}>
            <Button
              label="Keep waiting"
              onPress={onDismiss}
              variant="outline"
              style={styles.actionBtn}
              disabled={loading}
            />
            <Button
              label="Yes, cancel"
              onPress={onConfirm}
              loading={loading}
              style={styles.confirmBtn}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: theme.radius.card,
    padding: theme.spacing.lg,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.darkNavy,
    marginBottom: theme.spacing.sm,
  },
  policy: {
    fontSize: 15,
    color: '#4B5563',
    lineHeight: 22,
    marginBottom: theme.spacing.sm,
  },
  note: {
    fontSize: 13,
    color: '#9CA3AF',
    marginBottom: theme.spacing.lg,
  },
  actions: {
    gap: theme.spacing.sm,
  },
  actionBtn: {
    width: '100%',
  },
  confirmBtn: {
    width: '100%',
    backgroundColor: theme.colors.error,
  },
});