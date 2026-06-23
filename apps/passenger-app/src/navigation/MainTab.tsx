import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { Home } from '../screens/home/Home';
import { TripHistory } from '../screens/trip/TripHistory';
import { Wallet } from '../screens/account/Wallet';
import { Profile } from '../screens/account/Profile';
import { theme } from '../theme';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTab() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primaryGreen,
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: '#F3F4F6',
          paddingBottom: 8,
          paddingTop: 8,
          height: 60,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
        tabBarIcon: ({ color }) => {
          let icon = '📍';
          if (route.name === 'HomeTab') icon = '🛺';
          else if (route.name === 'TripHistoryTab') icon = '📜';
          else if (route.name === 'WalletTab') icon = '💳';
          else if (route.name === 'ProfileTab') icon = '👤';
          return <Text style={{ color, fontSize: 20 }}>{icon}</Text>;
        },
      })}
    >
      <Tab.Screen name="HomeTab" component={Home} options={{ title: 'Home' }} />
      <Tab.Screen name="TripHistoryTab" component={TripHistory} options={{ title: 'History' }} />
      <Tab.Screen name="WalletTab" component={Wallet} options={{ title: 'Wallet' }} />
      <Tab.Screen name="ProfileTab" component={Profile} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}
export default MainTab;
