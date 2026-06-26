import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigateToTripRequest() {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Main', { screen: 'TripRequest' });
}

export function navigateToTab() {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Main', { screen: 'Tab' });
}