import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { GetKycStatusResponse, KYCStatus, KycDocType } from '@higo/shared-types';
import { Button } from '../../components/Button';
import { DocUploadCard } from '../../components/DocUploadCard';
import { ScreenShell } from '../../components/ScreenShell';
import { api } from '../../services/api';
import { theme } from '../../theme';
import { KYC_DOC_ORDER } from '../../utils/kyc';
import type { DriverMainStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<DriverMainStackParamList, 'DocumentStatus'>;

export function DocumentStatus({ navigation }: Props) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<GetKycStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await api.getKycStatus();
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const docMap = new Map(
    status?.documents.map((d) => [d.docType, d]) ?? [],
  );

  const allApproved =
    status?.kycStatus === KYCStatus.APPROVED ||
    KYC_DOC_ORDER.every(
      (doc) => docMap.get(doc)?.status === KYCStatus.APPROVED,
    );

  if (loading && !status) {
    return (
      <ScreenShell scroll={false}>
        <ActivityIndicator
          size="large"
          color={theme.colors.primaryGreen}
          style={styles.loader}
        />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell scroll={false}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />
        }
        contentContainerStyle={styles.scroll}
      >
        {status ? (
          <View style={styles.summary}>
            <Text style={styles.summaryLabel}>Overall</Text>
            <Text style={styles.summaryValue}>{status.kycStatus}</Text>
            <Text style={styles.tier}>Tier {status.verificationTier}</Text>
          </View>
        ) : null}

        {KYC_DOC_ORDER.map((doc) => {
          const meta = docMap.get(doc);
          const canReupload =
            !meta ||
            meta.status === KYCStatus.REJECTED ||
            meta.status === undefined;

          return (
            <View key={doc}>
              <DocUploadCard
                docKey={doc}
                status={meta?.status ?? 'not_submitted'}
                onPress={() => {
                  if (canReupload || meta?.status !== KYCStatus.APPROVED) {
                    navigation.navigate('KYCUpload', { docType: doc as KycDocType });
                  }
                }}
              />
              {meta?.rejectionReason ? (
                <Text style={styles.rejection}>{meta.rejectionReason}</Text>
              ) : null}
              {meta?.rejectionCode ? (
                <Text style={styles.rejectionCode}>{meta.rejectionCode}</Text>
              ) : null}
            </View>
          );
        })}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {allApproved ? (
          <Button
            label={t('kyc.continueToHome')}
            onPress={() => navigation.navigate('Tab')}
            style={styles.cta}
          />
        ) : (
          <Button
            label={t('kyc.uploadTitle')}
            onPress={() => navigation.navigate('KYCUpload')}
            style={styles.cta}
          />
        )}
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingBottom: theme.spacing.xl,
  },
  loader: {
    marginTop: 48,
  },
  summary: {
    backgroundColor: theme.colors.darkNavy,
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  summaryLabel: {
    color: '#9CA3AF',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  summaryValue: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  tier: {
    color: theme.colors.accentOrange,
    marginTop: 4,
    fontWeight: '600',
  },
  rejection: {
    marginTop: -4,
    marginBottom: theme.spacing.sm,
    marginLeft: theme.spacing.sm,
    color: theme.colors.error,
    fontSize: 13,
  },
  rejectionCode: {
    marginTop: -8,
    marginBottom: theme.spacing.sm,
    marginLeft: theme.spacing.sm,
    color: '#6B7280',
    fontSize: 12,
  },
  error: {
    color: theme.colors.error,
    marginTop: theme.spacing.md,
  },
  cta: {
    marginTop: theme.spacing.lg,
  },
});