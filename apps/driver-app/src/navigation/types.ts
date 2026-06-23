import type { KycDocType } from '@higo/shared-types';

export type DriverAuthStackParamList = {
  DriverSplash: undefined;
  DriverLogin: undefined;
};

export type DriverMainStackParamList = {
  KYCUpload: { docType?: KycDocType } | undefined;
  DocumentStatus: undefined;
  Tab: undefined;
  TripRequest: undefined;
  Navigation: undefined;
  TripActive: undefined;
  TripComplete: undefined;
  RatePassenger: { tripId: string };
  Subscription: undefined;
  Support: undefined;
  DriverSOS: undefined;
  TrainingModule: undefined;
  NotificationSettings: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};