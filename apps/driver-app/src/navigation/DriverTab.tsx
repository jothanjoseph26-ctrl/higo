import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { GoOnlineHome } from '../screens/online/GoOnlineHome';
import { EarningsDashboard } from '../screens/earnings/EarningsDashboard';
import { DriverProfile } from '../screens/account/DriverProfile';
import { theme } from '../theme';

export type DriverTabParamList = {
  HomeTab: undefined;
  EarningsTab: undefined;
  AccountTab: undefined;
};

const Tab = createBottomTabNavigator<DriverTabParamList>();

export function DriverTab() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: theme.colors.primaryGreen,
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          backgroundColor: theme.colors.darkNavy,
          borderTopWidth: 0,
        },
        headerStyle: { backgroundColor: theme.colors.darkNavy },
        headerTintColor: '#fff',
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={GoOnlineHome}
        options={{ title: 'Home' }}
      />
      <Tab.Screen
        name="EarningsTab"
        component={EarningsDashboard}
        options={{ title: 'Earnings' }}
      />
      <Tab.Screen
        name="AccountTab"
        component={DriverProfile}
        options={{ title: 'Account' }}
      />
    </Tab.Navigator>
  );
}
