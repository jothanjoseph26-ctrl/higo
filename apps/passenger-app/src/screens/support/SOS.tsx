import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Alert, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { ScreenShell } from '../../components/ScreenShell';
import type { EmergencyContact } from '@higo/shared-types';

const SOS_CONTACTS_KEY = '@higo/passenger/sosContacts';

export function SOS() {
  const { t } = useTranslation();
  const [contacts, setContacts] = useState<EmergencyContact[]>([
    { name: '', phone: '', relationship: 'Family' },
    { name: '', phone: '', relationship: 'Friend' },
    { name: '', phone: '', relationship: 'Other' },
  ]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const saved = await AsyncStorage.getItem(SOS_CONTACTS_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as EmergencyContact[];
          // Pad to ensure exactly 3 slots
          const padded = [...parsed];
          while (padded.length < 3) {
            padded.push({ name: '', phone: '', relationship: 'Other' });
          }
          setContacts(padded.slice(0, 3));
        }
      } catch (e) {
        console.warn('Failed to load emergency contacts', e);
      }
    })();
  }, []);

  const handleUpdateContact = (index: number, field: keyof EmergencyContact, value: string) => {
    const updated = [...contacts];
    updated[index] = { ...updated[index], [field]: value };
    setContacts(updated);
  };

  const handleSave = async () => {
    // Filter out contacts with missing details
    const activeContacts = contacts.filter((c) => c.name.trim() !== '' && c.phone.trim() !== '');
    
    setSaving(true);
    try {
      await AsyncStorage.setItem(SOS_CONTACTS_KEY, JSON.stringify(activeContacts));
      Alert.alert('Contacts Saved', 'Your emergency contacts have been updated successfully.');
    } catch (e) {
      Alert.alert('Error', 'Failed to save emergency contacts.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenShell title={t('trip.sosTitle')} subtitle={t('trip.sosSubtitle')} scroll={true}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.warningCard}>
          <Text style={styles.warningText}>
            SOS activations will trigger immediate distress messages containing your live GPS coordinates to these contacts.
          </Text>
        </View>

        {contacts.map((contact, idx) => (
          <View key={idx} style={styles.contactCard}>
            <Text style={styles.contactHeader}>Emergency Contact #{idx + 1}</Text>
            <Input
              label="Contact Name"
              placeholder="e.g. Spouse / Brother"
              value={contact.name}
              onChangeText={(text) => handleUpdateContact(idx, 'name', text)}
              editable={!saving}
            />
            <Input
              label="Phone Number"
              placeholder="e.g. +23480xxxxxxxx"
              keyboardType="phone-pad"
              value={contact.phone}
              onChangeText={(text) => handleUpdateContact(idx, 'phone', text)}
              editable={!saving}
            />
          </View>
        ))}

        <Button
          label="Save SOS Contacts"
          onPress={handleSave}
          loading={saving}
          style={styles.saveBtn}
        />
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 40,
  },
  warningCard: {
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
    borderWidth: 1,
    borderColor: theme.colors.error,
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  warningText: {
    color: theme.colors.error,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  contactCard: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  contactHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.darkNavy,
    marginBottom: theme.spacing.md,
  },
  saveBtn: {
    marginTop: theme.spacing.md,
  },
});
export default SOS;
