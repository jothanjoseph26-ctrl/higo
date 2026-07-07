import { LinkingOptions } from '@react-navigation/native';
import type { RootStackParamList } from './types';

// On React Native `window` exists but `window.location` does not — guard both.
const passengerWebPrefix =
  typeof window !== 'undefined' && window.location?.origin
    ? `${window.location.origin}/passenger`
    : 'https://www.hiconnectgo.com/passenger';

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['higo-passenger://', 'https://www.hiconnectgo.com/passenger', passengerWebPrefix],
  config: {
    screens: {
      Main: {
        screens: {
          HomeTab: 'home',
          TripHistoryTab: 'history',
          WalletTab: 'wallet',
          ProfileTab: 'settings',
        },
      },
      Booking: 'booking',
      ConfirmRide: 'confirm-ride',
      TripActive: 'trip/active',
      TripComplete: 'trip/complete',
      ChatSupport: 'support/chat',
      Notifications: 'notifications',
      PaymentMethods: 'payment-callback', // maps callbacks from Paystack or banks back to the app
      Profile: 'profile',
      SavedPlaces: 'saved-places',
      Language: 'language',
    },
  },
};
export default linking;
