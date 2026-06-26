import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { theme } from '../../theme';
import { ScreenShell } from '../../components/ScreenShell';
import type { MainTabParamList, RootStackParamList } from '../../navigation/types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'ProfileTab'>,
  NativeStackScreenProps<RootStackParamList>
>;

interface SettingsItem {
  key: string;
  title: string;
  subtitle: string;
  icon: string;
  screen:
    | 'Profile'
    | 'Notifications'
    | 'SavedPlaces'
    | 'PaymentMethods'
    | 'Language'
    | 'ActiveTrips';
}

const SETTINGS_ITEMS: SettingsItem[] = [
  {
    key: 'profile',
    title: 'Profile',
    subtitle: 'Name, email, and account details',
    icon: '👤',
    screen: 'Profile',
  },
  {
    key: 'notifications',
    title: 'Notifications',
    subtitle: 'Trip alerts and promotions',
    icon: '🔔',
    screen: 'Notifications',
  },
  {
    key: 'saved-places',
    title: 'Saved Places',
    subtitle: 'Home and work shortcuts',
    icon: '🏠',
    screen: 'SavedPlaces',
  },
  {
    key: 'payment',
    title: 'Payment Methods',
    subtitle: 'Cash, card, bank, and USSD',
    icon: '💳',
    screen: 'PaymentMethods',
  },
  {
    key: 'language',
    title: 'Language',
    subtitle: 'English, Pidgin, Hausa, Yoruba',
    icon: '🌐',
    screen: 'Language',
  },
  {
    key: 'active-trips',
    title: 'Active Trips',
    subtitle: 'View and resume in-progress rides',
    icon: '🚕',
    screen: 'ActiveTrips',
  },
];

export function Settings({ navigation }: Props) {
  return (
    <ScreenShell title="Settings" subtitle="Manage your HiGo account preferences">
      <View style={styles.list}>
        {SETTINGS_ITEMS.map((item) => (
          <Pressable
            key={item.key}
            onPress={() => navigation.navigate(item.screen)}
            style={styles.item}
          >
            <Text style={styles.icon}>{item.icon}</Text>
            <View style={styles.details}>
              <Text style={styles.name}>{item.title}</Text>
              <Text style={styles.sub}>{item.subtitle}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))}
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: theme.spacing.sm,
    marginBottom: 40,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: theme.radius.card,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  icon: {
    fontSize: 24,
    marginRight: theme.spacing.md,
  },
  details: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.darkNavy,
  },
  sub: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  chevron: {
    fontSize: 24,
    color: '#9CA3AF',
    marginLeft: theme.spacing.sm,
  },
});

export default Settings;