import { LinkingOptions } from '@react-navigation/native';
import type { RootStackParamList } from './types';

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['higo-passenger://', 'https://hiconnectgo.com/passenger'],
  config: {
    screens: {
      Main: {
        screens: {
          HomeTab: 'home',
          TripHistoryTab: 'history',
          WalletTab: 'wallet',
          ProfileTab: 'profile',
        },
      },
      Booking: 'booking',
      ConfirmRide: 'confirm-ride',
      TripActive: 'trip/active',
      TripComplete: 'trip/complete',
      ChatSupport: 'support/chat',
      Notifications: 'notifications',
      PaymentMethods: 'payment-callback', // maps callbacks from Paystack or banks back to the app
    },
  },
};
export default linking;
