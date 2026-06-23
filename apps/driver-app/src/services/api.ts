import { createHigoClient } from '@higo/api-client';
import { API_BASE_URL } from '../config';
import { tokenStorage } from './storage';

export const api = createHigoClient({
  baseURL: API_BASE_URL,
  tokenStorage,
  platform: 'mobile',
  onAuthFailure: () => {
    void import('../stores/driverAuthStore').then(({ useDriverAuthStore }) =>
      useDriverAuthStore.getState().logout(),
    );
  },
});