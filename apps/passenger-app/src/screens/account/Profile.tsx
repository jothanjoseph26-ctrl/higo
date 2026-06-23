import React, { useState } from 'react';
import { StyleSheet, Text, View, Pressable, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { ScreenShell } from '../../components/ScreenShell';
import { useAuthStore } from '../../stores/authStore';
import i18n from '../../i18n';

export function Profile() {
  const { t } = useTranslation();
  const { user, updateProfile, logout, isLoading } = useAuthStore();

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [lang, setLang] = useState(user?.preferredLanguage || 'en');

  const handleUpdate = async () => {
    try {
      await updateProfile({ name, email, preferredLanguage: lang });
      await i18n.changeLanguage(lang);
      Alert.alert('Success', 'Profile updated successfully.');
    } catch (e: any) {
      Alert.alert('Update Failed', e.message || 'Unable to update profile.');
    }
  };

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => void logout() },
    ]);
  };

  const languages = [
    { code: 'en', name: 'English' },
    { code: 'pcm', name: 'Nigerian Pidgin' },
    { code: 'ha', name: 'Hausa' },
    { code: 'yo', name: 'Yoruba' },
  ];

  return (
    <ScreenShell title="My Profile" scroll={true}>
      <View style={styles.form}>
        <Input
          label={t('auth.fullNameLabel')}
          value={name}
          onChangeText={setName}
          editable={!isLoading}
        />
        
        <Input
          label={t('auth.emailLabel')}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          editable={!isLoading}
        />

        <Text style={styles.langLabel}>Preferred Language</Text>
        <View style={styles.langGrid}>
          {languages.map((l) => {
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
          label="Save Profile Changes"
          onPress={handleUpdate}
          loading={isLoading}
          style={styles.saveBtn}
        />

        <Button
          label="Log Out"
          onPress={handleLogout}
          variant="outline"
          style={styles.logoutBtn}
        />
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  form: {
    marginTop: theme.spacing.md,
  },
  langLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.darkNavy,
    marginBottom: theme.spacing.sm,
  },
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
    marginTop: theme.spacing.md,
  },
  logoutBtn: {
    marginTop: theme.spacing.md,
    borderColor: theme.colors.error,
    marginBottom: 40,
  },
});
export default Profile;
