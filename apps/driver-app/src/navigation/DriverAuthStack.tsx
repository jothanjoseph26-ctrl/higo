import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { DriverSplash } from '../screens/auth/DriverSplash';
import { LocationPermission } from '../screens/auth/LocationPermission';
import { NotificationPermission } from '../screens/auth/NotificationPermission';
import { DriverLogin } from '../screens/auth/DriverLogin';
import type { DriverAuthStackParamList } from './types';

const Stack = createNativeStackNavigator<DriverAuthStackParamList>();

export function DriverAuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="DriverSplash" component={DriverSplash} />
      <Stack.Screen name="LocationPermission" component={LocationPermission} />
      <Stack.Screen name="NotificationPermission" component={NotificationPermission} />
      <Stack.Screen name="DriverLogin" component={DriverLogin} />
    </Stack.Navigator>
  );
}