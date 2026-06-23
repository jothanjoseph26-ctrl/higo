import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TokenStorage } from '@higo/api-client';
import type { Driver, User } from '@higo/shared-types';

const KEYS = {
  accessToken: '@higo/driver/accessToken',
  refreshToken: '@higo/driver/refreshToken',
  user: '@higo/driver/user',
  driver: '@higo/driver/driver',
  language: '@higo/driver/language',
} as const;

export const tokenStorage: TokenStorage = {
  async getAccessToken() {
    return AsyncStorage.getItem(KEYS.accessToken);
  },
  async setAccessToken(token: string) {
    await AsyncStorage.setItem(KEYS.accessToken, token);
  },
  async getRefreshToken() {
    return AsyncStorage.getItem(KEYS.refreshToken);
  },
  async setRefreshToken(token: string) {
    await AsyncStorage.setItem(KEYS.refreshToken, token);
  },
  async clear() {
    await Promise.all([
      AsyncStorage.removeItem(KEYS.accessToken),
      AsyncStorage.removeItem(KEYS.refreshToken),
      AsyncStorage.removeItem(KEYS.user),
      AsyncStorage.removeItem(KEYS.driver),
    ]);
  },
};

export async function persistSession(user?: User, driver?: Driver): Promise<void> {
  if (user) {
    await AsyncStorage.setItem(KEYS.user, JSON.stringify(user));
  }
  if (driver) {
    await AsyncStorage.setItem(KEYS.driver, JSON.stringify(driver));
  }
}

export async function loadPersistedSession(): Promise<{
  user: User | null;
  driver: Driver | null;
}> {
  const [userRaw, driverRaw] = await Promise.all([
    AsyncStorage.getItem(KEYS.user),
    AsyncStorage.getItem(KEYS.driver),
  ]);
  return {
    user: userRaw ? (JSON.parse(userRaw) as User) : null,
    driver: driverRaw ? (JSON.parse(driverRaw) as Driver) : null,
  };
}

export async function getStoredLanguage(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.language);
}

export async function setStoredLanguage(lang: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.language, lang);
}