import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme';
import { Button } from '../../components/Button';
import { ScreenShell } from '../../components/ScreenShell';
import { SupportedLanguage } from '@higo/shared-types';
import { useAuthStore } from '../../stores/authStore';
import i18n from '../../i18n';

const LANGUAGES: Array<{ code: SupportedLanguage; name: string }> = [
  { code: SupportedLanguage.ENGLISH, name: 'English' },
  { code: SupportedLanguage.PIDGIN, name: 'Nigerian Pidgin' },
  { code: SupportedLanguage.HAUSA, name: 'Hausa' },
  { code: SupportedLanguage.YORUBA, name: 'Yoruba' },
];

export function Language() {
  const { t } = useTranslation();
  const { user, updateProfile, isLoading } = useAuthStore();
  const [lang, setLang] = useState<SupportedLanguage>(
    user?.preferredLanguage ?? SupportedLanguage.ENGLISH,
  );

  const handleSave = async () => {
    try {
      await updateProfile({ preferredLanguage: lang });
      await i18n.changeLanguage(lang);
      Alert.alert('Success', 'Language preference updated.');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unable to update language.';
      Alert.alert('Update Failed', message);
    }
  };

  return (
    <ScreenShell title="Language" subtitle="Choose your preferred app language">
      <View style={styles.langGrid}>
        {LANGUAGES.map((l) => {
          const isSelected = lang === l.code;
          return (
            <Pressable
              key={l.code}
              onPress={() => setLang(l.code)}
              style={[styles.langBtn, isSelected && styles.activeLang]}
            >
              <Text style={[styles.langText, isSelected && styles.activeLangText]}>
                {l.name}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Button
        label={t('common.save', { defaultValue: 'Save Changes' })}
        onPress={() => void handleSave()}
        loading={isLoading}
        style={styles.saveBtn}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  langGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: theme.spacing.lg,
  },
  langBtn: {
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: theme.radius.input,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
  },
  activeLang: {
    borderColor: theme.colors.primaryGreen,
    backgroundColor: 'rgba(11, 110, 79, 0.05)',
  },
  langText: {
    fontSize: 14,
    color: theme.colors.dark,
    fontWeight: '600',
  },
  activeLangText: {
    color: theme.colors.primaryGreen,
  },
  saveBtn: {
    marginBottom: 40,
  },
});

export default Language;