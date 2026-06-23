import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Input } from './Input';
import { theme } from '../theme';

interface OcrFieldsFormProps {
  fields: Record<string, string>;
  onChange: (fields: Record<string, string>) => void;
}

export function OcrFieldsForm({ fields, onChange }: OcrFieldsFormProps) {
  const { t } = useTranslation();
  const [local, setLocal] = useState(fields);

  useEffect(() => {
    setLocal(fields);
  }, [fields]);

  const keys = Object.keys(local);

  if (keys.length === 0) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.badgeRow}>
        <Text style={styles.badge}>{t('kyc.ocrBadge')}</Text>
      </View>
      <Text style={styles.title}>{t('kyc.ocrTitle')}</Text>
      {keys.map((key) => (
        <Input
          key={key}
          label={key.replace(/_/g, ' ')}
          value={local[key]}
          onChangeText={(text) => {
            const next = { ...local, [key]: text };
            setLocal(next);
            onChange(next);
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: theme.spacing.md,
    backgroundColor: '#fff',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
  },
  badgeRow: {
    marginBottom: theme.spacing.sm,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.accentOrange,
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.darkNavy,
    marginBottom: theme.spacing.sm,
  },
});