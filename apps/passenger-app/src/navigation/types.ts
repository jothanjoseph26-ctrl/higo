import { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainTabParamList>;
  Booking: undefined;
  RideOptions: undefined;
  ConfirmRide: undefined;
  FindingDriver: undefined;
  DriverEnRoute: undefined;
  NaijaTrivia: undefined;
  TripActive: undefined;
  TripChat: { tripId: string };
  TripComplete: undefined;
  TripReceipt: undefined;
  ActiveTrips: undefined;
  RateDriver: undefined;
  PaymentMethods: undefined;
  Profile: undefined;
  SavedPlaces: undefined;
  Language: undefined;
  SOS: undefined;
  Notifications: undefined;
  HelpFAQ: undefined;
  ChatSupport: undefined;
};

export type AuthStackParamList = {
  Splash: undefined;
  Onboard1: undefined;
  Onboard2: undefined;
  Onboard3: undefined;
  LocationPermission: undefined;
  NotificationPermission: undefined;
  Login: undefined;
  SignUp: undefined;
};

export type MainTabParamList = {
  HomeTab: undefined;
  TripHistoryTab: undefined;
  WalletTab: undefined;
  ProfileTab: undefined;
};
