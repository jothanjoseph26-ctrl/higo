import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Splash } from '../screens/auth/Splash';
import { Onboard1 } from '../screens/auth/Onboard1';
import { Onboard2 } from '../screens/auth/Onboard2';
import { Onboard3 } from '../screens/auth/Onboard3';
import { LocationPermission } from '../screens/auth/LocationPermission';
import { NotificationPermission } from '../screens/auth/NotificationPermission';
import { Login } from '../screens/auth/Login';
import { SignUp } from '../screens/auth/SignUp';
import type { AuthStackParamList } from './types';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Splash">
      <Stack.Screen name="Splash" component={Splash} />
      <Stack.Screen name="Onboard1" component={Onboard1} />
      <Stack.Screen name="Onboard2" component={Onboard2} />
      <Stack.Screen name="Onboard3" component={Onboard3} />
      <Stack.Screen name="LocationPermission" component={LocationPermission} />
      <Stack.Screen name="NotificationPermission" component={NotificationPermission} />
      <Stack.Screen name="Login" component={Login} />
      <Stack.Screen name="SignUp" component={SignUp} />
    </Stack.Navigator>
  );
}
