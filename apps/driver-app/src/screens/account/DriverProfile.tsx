import React from 'react';
import { StyleSheet, Text, View, Alert, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useDriverAuthStore } from '../../stores/driverAuthStore';
import { Button } from '../../components/Button';
import { setStoredLanguage } from '../../services/storage';
import { theme } from '../../theme';
import type { DriverMainStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<DriverMainStackParamList, 'Tab'>;

export function DriverProfile({ navigation }: { navigation: any }) {
  const { t, i18n } = useTranslation();
  const { driver, logout } = useDriverAuthStore();

  const handleLanguageChange = (lang: string) => {
    Alert.alert(
      'Change Preferred Language',
      'Select your language for voice commands and receipt summaries:',
      [
        {
          text: 'English',
          onPress: async () => {
            await i18n.changeLanguage('en');
            await setStoredLanguage('en');
          },
        },
        {
          text: 'Pidgin (Nigerian)',
          onPress: async () => {
            await i18n.changeLanguage('pcm');
            await setStoredLanguage('pcm');
          },
        },
        {
          text: 'Hausa',
          onPress: async () => {
            await i18n.changeLanguage('ha');
            await setStoredLanguage('ha');
          },
        },
        {
          text: 'Yoruba',
          onPress: async () => {
            await i18n.changeLanguage('yo');
            await setStoredLanguage('yo');
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const kycStatus = driver?.kycStatus?.toUpperCase() || 'INCOMPLETE';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Account Profile</Text>

      {/* Driver Info */}
      <View style={styles.card}>
        <Text style={styles.driverName}>{driver?.name || 'Driver'}</Text>
        <Text style={styles.phone}>{driver?.phone || 'No Phone'}</Text>
        <View style={styles.statusRow}>
          <Text style={styles.label}>KYC Status: </Text>
          <Text
            style={[
              styles.statusText,
              kycStatus === 'APPROVED' ? styles.approved : styles.pending,
            ]}
          >
            {kycStatus}
          </Text>
        </View>
      </View>

      {/* Vehicle Info */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Vehicle Details</Text>
        <Text style={styles.infoText}>Plate: {driver?.vehiclePlate || 'Not Set'}</Text>
        <Text style={styles.infoText}>
          Model: {driver?.vehicleModel || 'Not Set'} ({driver?.vehicleColor || 'Color Not Set'})
        </Text>
        <Text style={styles.infoText}>Type: {driver?.vehicleType?.toUpperCase() || 'Not Set'}</Text>
      </View>

      {/* Options */}
      <View style={styles.optionsWrap}>
        <Button
          label="🌐 Preferred Language"
          onPress={() => handleLanguageChange('en')}
          variant="outline"
        />
        <Button
          label="⭐ Ratings & Performance"
          onPress={() => navigation.navigate('RatingsPerformance')}
          variant="outline"
        />
        <Button
          label="📚 Safety & Training Module"
          onPress={() => navigation.navigate('TrainingModule')}
          variant="outline"
        />
        <Button
          label="📡 Offline Sync Queue"
          onPress={() => navigation.navigate('OfflineQueueScreen')}
          variant="outline"
        />
        <Button
          label="🔔 Notification Settings"
          onPress={() => navigation.navigate('NotificationSettings')}
          variant="outline"
        />
        <Button
          label="💬 Support & Disputes"
          onPress={() => navigation.navigate('Support')}
          variant="outline"
        />
        <Button
          label="💳 Manage Subscription"
          onPress={() => navigation.navigate('Subscription')}
          variant="outline"
        />
        <Button
          label="🚨 Safety SOS Contacts"
          onPress={() => navigation.navigate('DriverSOS')}
          variant="outline"
        />
      </View>

      <Button
        label="Log Out"
        onPress={() => void logout()}
        variant="secondary"
        style={styles.logoutBtn}
      />
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
  driverName: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.darkNavy,
  },
  phone: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  statusRow: {
    flexDirection: 'row',
    marginTop: theme.spacing.sm,
    alignItems: 'center',
  },
  label: {
    fontSize: 13,
    color: '#4B5563',
  },
  statusText: {
    fontSize: 13,
    fontWeight: '700',
  },
  approved: {
    color: theme.colors.primaryGreen,
  },
  pending: {
    color: theme.colors.accentOrange,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.darkNavy,
    marginBottom: theme.spacing.sm,
  },
  infoText: {
    fontSize: 14,
    color: '#4B5563',
    marginBottom: 6,
  },
  optionsWrap: {
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  logoutBtn: {
    borderColor: theme.colors.error,
  },
});
