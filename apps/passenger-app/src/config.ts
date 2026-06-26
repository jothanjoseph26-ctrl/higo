import { Platform } from 'react-native';

const PROD_API = 'https://hiconnect-production.up.railway.app/api';
const PROD_WS = 'https://hiconnect-production.up.railway.app';

/** API base URL — Vite injects VITE_API_BASE_URL at web build time. */
export const API_BASE_URL =
  (typeof import.meta !== 'undefined' &&
    (import.meta as ImportMeta & { env?: { VITE_API_BASE_URL?: string } }).env
      ?.VITE_API_BASE_URL) ||
  Platform.select({
    android: PROD_API,
    ios: PROD_API,
    default: PROD_API,
  });

export const WS_BASE_URL =
  (typeof import.meta !== 'undefined' &&
    (import.meta as ImportMeta & { env?: { VITE_SOCKET_URL?: string } }).env
      ?.VITE_SOCKET_URL) ||
  Platform.select({
    android: PROD_WS,
    ios: PROD_WS,
    default: PROD_WS,
  });
