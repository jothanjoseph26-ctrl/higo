import React, { useEffect } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import { useAuthStore } from '../stores/authStore';
import { AuthStack } from './AuthStack';
import { MainTab } from './MainTab';
import { Booking } from '../screens/home/Booking';
import { RideOptions } from '../screens/home/RideOptions';
import { ConfirmRide } from '../screens/home/ConfirmRide';
import { FindingDriver } from '../screens/trip/FindingDriver';
import { DriverEnRoute } from '../screens/trip/DriverEnRoute';
import { NaijaTrivia } from '../screens/trip/NaijaTrivia';
import { TripActive } from '../screens/trip/TripActive';
import { TripComplete } from '../screens/trip/TripComplete';
import { RateDriver } from '../screens/trip/RateDriver';
import { PaymentMethods } from '../screens/account/PaymentMethods';
import { SOS } from '../screens/support/SOS';
import { Notifications } from '../screens/account/Notifications';
import { HelpFAQ } from '../screens/support/HelpFAQ';
import { ChatSupport } from '../screens/support/ChatSupport';
import { theme } from '../theme';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootStack() {
  const { isAuthenticated, isHydrated, hydrate } = useAuthStore();

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
        <>
          {/* Main Gated Tab */}
          <Stack.Screen name="Main" component={MainTab} />

          {/* Modal Overlays group */}
          <Stack.Group screenOptions={{ presentation: 'modal', headerShown: true }}>
            <Stack.Screen name="Booking" component={Booking} options={{ title: 'Where to?' }} />
            <Stack.Screen name="RideOptions" component={RideOptions} options={{ title: 'Select Fare' }} />
            <Stack.Screen name="ConfirmRide" component={ConfirmRide} options={{ title: 'Confirm Booking' }} />
            <Stack.Screen name="FindingDriver" component={FindingDriver} options={{ headerShown: false }} />
            <Stack.Screen name="DriverEnRoute" component={DriverEnRoute} options={{ headerShown: false }} />
            <Stack.Screen name="NaijaTrivia" component={NaijaTrivia} options={{ title: 'Naija Trivia' }} />
            <Stack.Screen name="TripActive" component={TripActive} options={{ headerShown: false }} />
            <Stack.Screen name="TripComplete" component={TripComplete} options={{ headerShown: false }} />
            <Stack.Screen name="RateDriver" component={RateDriver} options={{ headerShown: false }} />
            <Stack.Screen name="PaymentMethods" component={PaymentMethods} options={{ title: 'Payment Options' }} />
            <Stack.Screen name="SOS" component={SOS} options={{ title: 'Emergency Contacts' }} />
            <Stack.Screen name="Notifications" component={Notifications} options={{ title: 'Alerts' }} />
            <Stack.Screen name="HelpFAQ" component={HelpFAQ} options={{ title: 'Help & FAQs' }} />
            <Stack.Screen name="ChatSupport" component={ChatSupport} options={{ title: 'Chat Support' }} />
          </Stack.Group>
        </>
      ) : (
        <Stack.Screen name="Auth" component={AuthStack} />
      )}
    </Stack.Navigator>
  );
}
export default RootStack;
