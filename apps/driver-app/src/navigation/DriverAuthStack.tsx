import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { DriverSplash } from '../screens/auth/DriverSplash';
import { DriverLogin } from '../screens/auth/DriverLogin';
import type { DriverAuthStackParamList } from './types';

const Stack = createNativeStackNavigator<DriverAuthStackParamList>();

export function DriverAuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="DriverSplash" component={DriverSplash} />
      <Stack.Screen name="DriverLogin" component={DriverLogin} />
    </Stack.Navigator>
  );
}