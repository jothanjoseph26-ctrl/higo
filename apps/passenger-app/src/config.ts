import { Platform } from 'react-native';

/** API base URL — override via Metro env or edit for device testing. */
export const API_BASE_URL = Platform.select({
  android: 'https://higo-ej5k.onrender.com/api',
  ios: 'https://higo-ej5k.onrender.com/api',
  default: 'https://higo-ej5k.onrender.com/api',
});

export const WS_BASE_URL = Platform.select({
  android: 'https://higo-ej5k.onrender.com',
  ios: 'https://higo-ej5k.onrender.com',
  default: 'https://higo-ej5k.onrender.com',
});
