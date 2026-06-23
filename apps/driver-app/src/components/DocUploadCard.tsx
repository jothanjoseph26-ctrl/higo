import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { KYCStatus } from '@higo/shared-types';
import { useTranslation } from 'react-i18next';
import { theme } from '../theme';

interface DocUploadCardProps {
  docKey: string;
  status?: KYCStatus | 'not_submitted';
  selected?: boolean;
  onPress: () => void;
}

const statusColors: Record<string, string> = {
  [KYCStatus.APPROVED]: theme.colors.success,
  [KYCStatus.PENDING]: theme.colors.warning,
  [KYCStatus.UNDER_REVIEW]: theme.colors.warning,
  [KYCStatus.REJECTED]: theme.colors.error,
  not_submitted: '#9CA3AF',
};

export function DocUploadCard({
  docKey,
  status = 'not_submitted',
  selected,
  onPress,
}: DocUploadCardProps) {
  const { t } = useTranslation();

  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, selected && styles.selected]}
    >
      <View style={styles.row}>
        <Text style={styles.title}>
          {t(`kyc.docTypes.${docKey}` as const, docKey)}
        </Text>
        <View style={[styles.badge, { backgroundColor: statusColors[status] }]}>
          <Text style={styles.badgeText}>
            {status === KYCStatus.APPROVED
              ? t('kyc.statusApproved')
              : status === KYCStatus.REJECTED
                ? t('kyc.statusRejected')
                : status === KYCStatus.PENDING ||
                    status === KYCStatus.UNDER_REVIEW
                  ? t('kyc.statusPending')
                  : '—'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  selected: {
    borderColor: theme.colors.primaryGreen,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.darkNavy,
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
});