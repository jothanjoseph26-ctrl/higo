import type { NavigatorScreenParams } from '@react-navigation/native';
import type { KycDocType } from '@higo/shared-types';

export type DriverAuthStackParamList = {
  DriverSplash: undefined;
  LocationPermission: undefined;
  NotificationPermission: undefined;
  DriverLogin: undefined;
};

export type DriverMainStackParamList = {
  KYCUpload: { docType?: KycDocType } | undefined;
  DocumentStatus: undefined;
  VehicleOnboarding: undefined;
  Tab: undefined;
  TripRequest: undefined;
  Navigation: undefined;
  TripActive: undefined;
  TripChat: { tripId: string };
  TripComplete: undefined;
  RatePassenger: { tripId: string };
  Subscription: undefined;
  Support: undefined;
  DriverSOS: undefined;
  TrainingModule: undefined;
  NotificationSettings: undefined;
  TripEarningsDetail: { tripId: string };
  RatingsPerformance: undefined;
  OfflineQueueScreen: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  Main: NavigatorScreenParams<DriverMainStackParamList> | undefined;
};