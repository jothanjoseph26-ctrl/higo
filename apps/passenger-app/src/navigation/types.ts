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
  TripComplete: undefined;
  RateDriver: undefined;
  PaymentMethods: undefined;
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
  Login: undefined;
  SignUp: undefined;
};

export type MainTabParamList = {
  HomeTab: undefined;
  TripHistoryTab: undefined;
  WalletTab: undefined;
  ProfileTab: undefined;
};
