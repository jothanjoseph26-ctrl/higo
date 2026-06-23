import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { useDriverAuthStore } from '../../stores/driverAuthStore';
import { theme } from '../../theme';

interface EmergencyContact {
  name: string;
  phone: string;
  relationship: string;
}

export function DriverSOS() {
  const { user } = useDriverAuthStore();
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relationship, setRelationship] = useState('');

  useEffect(() => {
    void loadContacts();
  }, []);

  const loadContacts = async () => {
    try {
      const stored = await AsyncStorage.getItem('@higo/driver/sos_contacts');
      if (stored) {
        setContacts(JSON.parse(stored) as EmergencyContact[]);
      } else if (user?.emergencyContacts) {
        setContacts(user.emergencyContacts as EmergencyContact[]);
      }
    } catch {}
  };

  const handleAddContact = async () => {
    if (!name || !phone) {
      Alert.alert('Required Fields', 'Please provide a name and phone number.');
      return;
    }

    const newContact: EmergencyContact = { name, phone, relationship };
    const next = [...contacts, newContact];
    setContacts(next);
    await AsyncStorage.setItem('@higo/driver/sos_contacts', JSON.stringify(next));

    setName('');
    setPhone('');
    setRelationship('');
    Alert.alert('Contact Added', 'Your emergency contact has been configured.');
  };

  const handleRemoveContact = async (index: number) => {
    const next = contacts.filter((_, i) => i !== index);
    setContacts(next);
    await AsyncStorage.setItem('@higo/driver/sos_contacts', JSON.stringify(next));
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Safety SOS</Text>

      {/* Safety info */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>🚨 How SOS Works</Text>
        <Text style={styles.infoText}>
          Triggering SOS during an active ride will:
          {"\n"}1. Start sharing your GPS location every 30 seconds.
          {"\n"}2. Notify your configured emergency contacts via SMS fallback.
          {"\n"}3. Alert the HiGo Abuja Ops Control Room.
        </Text>
      </View>

      {/* Emergency Contacts List */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Your Emergency Contacts</Text>
        {contacts.length === 0 ? (
          <Text style={styles.emptyText}>No emergency contacts configured yet.</Text>
        ) : (
          contacts.map((c, i) => (
            <View key={i} style={styles.contactRow}>
              <View>
                <Text style={styles.contactName}>{c.name} ({c.relationship || 'Friend'})</Text>
                <Text style={styles.contactPhone}>{c.phone}</Text>
              </View>
              <Text style={styles.removeLink} onPress={() => handleRemoveContact(i)}>
                Remove
              </Text>
            </View>
          ))
        )}
      </View>

      {/* Add Contact Form */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Add Emergency Contact</Text>
        <Input label="Name" placeholder="e.g. John Doe" value={name} onChangeText={setName} />
        <Input
          label="Phone Number"
          placeholder="e.g. +234..."
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />
        <Input
          label="Relationship"
          placeholder="e.g. Spouse, Brother, Friend"
          value={relationship}
          onChangeText={setRelationship}
        />
        <Button label="Add Contact" onPress={handleAddContact} style={styles.addBtn} />
      </View>
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
  infoCard: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.error,
    marginBottom: 6,
  },
  infoText: {
    fontSize: 13,
    color: '#7F1D1D',
    lineHeight: 18,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadow.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.darkNavy,
    marginBottom: theme.spacing.sm,
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 14,
  },
  contactRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  contactName: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.darkNavy,
  },
  contactPhone: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  removeLink: {
    fontSize: 13,
    color: theme.colors.error,
    fontWeight: '600',
  },
  addBtn: {
    marginTop: theme.spacing.sm,
  },
});
