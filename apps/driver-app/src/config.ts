const PROD_API = 'https://hiconnect-production.up.railway.app/api';

/** API base URL — Vite injects VITE_API_BASE_URL at web build time. */
export const API_BASE_URL =
  (typeof import.meta !== 'undefined' &&
    (import.meta as ImportMeta & { env?: { VITE_API_BASE_URL?: string } }).env
      ?.VITE_API_BASE_URL) ||
  PROD_API;

/** Android emulator loopback to host machine. */
export const API_BASE_URL_ANDROID_EMULATOR = 'http://10.0.2.2:3000/api';