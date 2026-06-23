import React, { useEffect } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import { useDriverAuthStore } from '../stores/driverAuthStore';
import { DriverAuthStack } from './DriverAuthStack';
import { DriverMainStack } from './DriverMainStack';
import type { RootStackParamList } from './types';
import { theme } from '../theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootStack() {
  const { isAuthenticated, isHydrated, hydrate } = useDriverAuthStore();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (!isHydrated) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.lightGrey,
        }}
      >
        <ActivityIndicator size="large" color={theme.colors.primaryGreen} />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isAuthenticated ? (
        <Stack.Screen name="Main" component={DriverMainStack} />
      ) : (
        <Stack.Screen name="Auth" component={DriverAuthStack} />
      )}
    </Stack.Navigator>
  );
}