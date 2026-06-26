import { createHigoClient } from '@higo/api-client';
import type { Driver, VehicleType } from '@higo/shared-types';
import { Platform } from 'react-native';
import { API_BASE_URL } from '../config';
import { tokenStorage } from './storage';

export const api = createHigoClient({
  baseURL: API_BASE_URL,
  tokenStorage,
  platform: Platform.OS === 'web' ? 'web' : 'mobile',
  onAuthFailure: () => {
    void import('../stores/driverAuthStore').then(({ useDriverAuthStore }) =>
      useDriverAuthStore.getState().logout(),
    );
  },
});

export interface UpdateDriverProfilePayload {
  name?: string;
  vehiclePlate?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  vehicleYear?: number;
  vehicleType?: VehicleType;
  fcmToken?: string;
}

export async function getDriverProfile(): Promise<Driver> {
  return api.request<Driver>({
    method: 'GET',
    url: '/drivers/me',
  });
}

export async function updateDriverProfile(
  payload: UpdateDriverProfilePayload,
): Promise<Driver> {
  return api.request<Driver>({
    method: 'PUT',
    url: '/drivers/me',
    data: payload,
  });
}