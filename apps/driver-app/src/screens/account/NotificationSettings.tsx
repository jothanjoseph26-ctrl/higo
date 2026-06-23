import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Switch, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { theme } from '../../theme';

export function NotificationSettings() {
  const [offers, setOffers] = useState(true);
  const [earnings, setEarnings] = useState(true);
  const [chats, setChats] = useState(true);
  const [announcements, setAnnouncements] = useState(false);

  useEffect(() => {
    void loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const stored = await AsyncStorage.getItem('@higo/driver/notif_settings');
      if (stored) {
        const parsed = JSON.parse(stored);
        setOffers(parsed.offers ?? true);
        setEarnings(parsed.earnings ?? true);
        setChats(parsed.chats ?? true);
        setAnnouncements(parsed.announcements ?? false);
      }
    } catch {}
  };

  const handleToggle = async (key: string, val: boolean) => {
    let nextSettings = { offers, earnings, chats, announcements };
    if (key === 'offers') {
      setOffers(val);
      nextSettings.offers = val;
    } else if (key === 'earnings') {
      setEarnings(val);
      nextSettings.earnings = val;
    } else if (key === 'chats') {
      setChats(val);
      nextSettings.chats = val;
    } else if (key === 'announcements') {
      setAnnouncements(val);
      nextSettings.announcements = val;
    }
    await AsyncStorage.setItem('@higo/driver/notif_settings', JSON.stringify(nextSettings));
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Notification Settings</Text>

      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.textWrap}>
            <Text style={styles.label}>New Trip Offers</Text>
            <Text style={styles.description}>Get notified immediately when new rides match your area</Text>
          </View>
          <Switch
            value={offers}
            onValueChange={(val) => void handleToggle('offers', val)}
            trackColor={{ true: theme.colors.primaryGreen }}
          />
        </View>

        <View style={styles.row}>
          <View style={styles.textWrap}>
            <Text style={styles.label}>Earnings & Withdrawals</Text>
            <Text style={styles.description}>Confirm receipt of payments and withdrawal processing status</Text>
          </View>
          <Switch
            value={earnings}
            onValueChange={(val) => void handleToggle('earnings', val)}
            trackColor={{ true: theme.colors.primaryGreen }}
          />
        </View>

        <View style={styles.row}>
          <View style={styles.textWrap}>
            <Text style={styles.label}>Chat Messages</Text>
            <Text style={styles.description}>Receive notifications when passenger sends a message</Text>
          </View>
          <Switch
            value={chats}
            onValueChange={(val) => void handleToggle('chats', val)}
            trackColor={{ true: theme.colors.primaryGreen }}
          />
        </View>

        <View style={styles.row}>
          <View style={styles.textWrap}>
            <Text style={styles.label}>System Announcements</Text>
            <Text style={styles.description}>Stay updated on safety guidelines and policy changes</Text>
          </View>
          <Switch
            value={announcements}
            onValueChange={(val) => void handleToggle('announcements', val)}
            trackColor={{ true: theme.colors.primaryGreen }}
          />
        </View>
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
  card: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    ...theme.shadow.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  textWrap: {
    flex: 1,
    marginRight: theme.spacing.md,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.darkNavy,
  },
  description: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
});
