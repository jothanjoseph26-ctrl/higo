import React, { useState } from 'react';
import { StyleSheet, View, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { ScreenShell } from '../../components/ScreenShell';
import { useAuthStore } from '../../stores/authStore';

export function Profile() {
  const { t } = useTranslation();
  const { user, updateProfile, logout, isLoading } = useAuthStore();

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');

  const handleUpdate = async () => {
    try {
      await updateProfile({ name, email });
      Alert.alert('Success', 'Profile updated successfully.');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unable to update profile.';
      Alert.alert('Update Failed', message);
    }
  };

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => void logout() },
    ]);
  };

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
