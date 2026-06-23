import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { KYCStatus } from '@higo/shared-types';
import { KYCUpload } from '../screens/kyc/KYCUpload';
import { DocumentStatus } from '../screens/kyc/DocumentStatus';
import { DriverTab } from './DriverTab';
import { TripRequest } from '../screens/online/TripRequest';
import { Navigation } from '../screens/online/Navigation';
import { TripActive } from '../screens/online/TripActive';
import { TripComplete } from '../screens/online/TripComplete';
import { RatePassenger } from '../screens/online/RatePassenger';
import { Subscription } from '../screens/earnings/Subscription';
import { Support } from '../screens/account/Support';
import { DriverSOS } from '../screens/account/DriverSOS';
import { TrainingModule } from '../screens/account/TrainingModule';
import { NotificationSettings } from '../screens/account/NotificationSettings';
import { useDriverAuthStore } from '../stores/driverAuthStore';
import { theme } from '../theme';
import type { DriverMainStackParamList } from './types';

const Stack = createNativeStackNavigator<DriverMainStackParamList>();

function resolveInitialRoute(
  isNewUser: boolean,
  kycStatus?: KYCStatus
): keyof DriverMainStackParamList {
  if (isNewUser) return 'KYCUpload';
  if (kycStatus === KYCStatus.APPROVED) return 'Tab';
  return 'DocumentStatus';
}

export function DriverMainStack() {
  const { isNewUser, driver } = useDriverAuthStore();
  const initialRoute = resolveInitialRoute(isNewUser, driver?.kycStatus);

  return (
    <Stack.Navigator
      initialRouteName={initialRoute}
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.darkNavy },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen
        name="Tab"
        component={DriverTab}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="KYCUpload"
        component={KYCUpload}
        options={{ title: 'Upload' }}
      />
      <Stack.Screen
        name="DocumentStatus"
        component={DocumentStatus}
        options={{ title: 'Documents' }}
      />
      <Stack.Screen
        name="TripRequest"
        component={TripRequest}
        options={{ title: 'New Request', headerShown: false }}
      />
      <Stack.Screen
        name="Navigation"
        component={Navigation}
        options={{ title: 'Navigation' }}
      />
      <Stack.Screen
        name="TripActive"
        component={TripActive}
        options={{ title: 'Ride Active' }}
      />
      <Stack.Screen
        name="TripComplete"
        component={TripComplete}
        options={{ title: 'Ride Receipt' }}
      />
      <Stack.Screen
        name="RatePassenger"
        component={RatePassenger}
        options={{ title: 'Rate Passenger' }}
      />
      <Stack.Screen
        name="Subscription"
        component={Subscription}
        options={{ title: 'Subscription' }}
      />
      <Stack.Screen
        name="Support"
        component={Support}
        options={{ title: 'Support & Disputes' }}
      />
      <Stack.Screen
        name="DriverSOS"
        component={DriverSOS}
        options={{ title: 'SOS Safety' }}
      />
      <Stack.Screen
        name="TrainingModule"
        component={TrainingModule}
        options={{ title: 'Safety Training' }}
      />
      <Stack.Screen
        name="NotificationSettings"
        component={NotificationSettings}
        options={{ title: 'Notifications' }}
      />
    </Stack.Navigator>
  );
}