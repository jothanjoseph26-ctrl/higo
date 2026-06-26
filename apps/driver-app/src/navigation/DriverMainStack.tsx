import React, { useEffect } from 'react';
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import type { Driver } from '@higo/shared-types';
import { KYCStatus } from '@higo/shared-types';
import { KYCUpload } from '../screens/kyc/KYCUpload';
import { DocumentStatus } from '../screens/kyc/DocumentStatus';
import { VehicleOnboarding } from '../screens/onboarding/VehicleOnboarding';
import { DriverTab } from './DriverTab';
import { TripRequest } from '../screens/online/TripRequest';
import { Navigation } from '../screens/online/Navigation';
import { TripActive } from '../screens/online/TripActive';
import { TripChat } from '../screens/online/TripChat';
import { TripComplete } from '../screens/online/TripComplete';
import { RatePassenger } from '../screens/online/RatePassenger';
import { Subscription } from '../screens/earnings/Subscription';
import { TripEarningsDetail } from '../screens/earnings/TripEarningsDetail';
import { Support } from '../screens/account/Support';
import { DriverSOS } from '../screens/account/DriverSOS';
import { TrainingModule } from '../screens/account/TrainingModule';
import { NotificationSettings } from '../screens/account/NotificationSettings';
import { RatingsPerformance } from '../screens/account/RatingsPerformance';
import { OfflineQueueScreen } from '../screens/account/OfflineQueueScreen';
import {
  isVehicleProfileIncomplete,
  useDriverAuthStore,
} from '../stores/driverAuthStore';
import { theme } from '../theme';
import type { DriverMainStackParamList } from './types';

const Stack = createNativeStackNavigator<DriverMainStackParamList>();

function resolveInitialRoute(
  isNewUser: boolean,
  kycStatus?: KYCStatus,
  driver?: Driver | null,
): keyof DriverMainStackParamList {
  if (isNewUser) return 'KYCUpload';
  if (kycStatus === KYCStatus.APPROVED) {
    if (isVehicleProfileIncomplete(driver)) return 'VehicleOnboarding';
    return 'Tab';
  }
  return 'DocumentStatus';
}

function TabGate() {
  const navigation =
    useNavigation<NativeStackNavigationProp<DriverMainStackParamList>>();
  const { driver } = useDriverAuthStore();

  useEffect(() => {
    if (isVehicleProfileIncomplete(driver)) {
      navigation.reset({
        index: 0,
        routes: [{ name: 'VehicleOnboarding' }],
      });
    }
  }, [driver, navigation]);

  if (isVehicleProfileIncomplete(driver)) {
    return null;
  }

  return <DriverTab />;
}

export function DriverMainStack() {
  const { isNewUser, driver } = useDriverAuthStore();
  const initialRoute = resolveInitialRoute(
    isNewUser,
    driver?.kycStatus,
    driver,
  );

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
        component={TabGate}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="VehicleOnboarding"
        component={VehicleOnboarding}
        options={{ title: 'Vehicle Setup', headerBackVisible: false }}
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
        name="TripChat"
        component={TripChat}
        options={{ title: 'Trip Chat' }}
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
      <Stack.Screen
        name="TripEarningsDetail"
        component={TripEarningsDetail}
        options={{ title: 'Trip Earnings' }}
      />
      <Stack.Screen
        name="RatingsPerformance"
        component={RatingsPerformance}
        options={{ title: 'Ratings & Performance' }}
      />
      <Stack.Screen
        name="OfflineQueueScreen"
        component={OfflineQueueScreen}
        options={{ title: 'Offline Sync Queue' }}
      />
    </Stack.Navigator>
  );
}