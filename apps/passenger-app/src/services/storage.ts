import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TokenStorage } from '@higo/api-client';
import type { User } from '@higo/shared-types';

const KEYS = {
  accessToken: '@higo/passenger/accessToken',
  refreshToken: '@higo/passenger/refreshToken',
  user: '@higo/passenger/user',
  language: '@higo/passenger/language',
  triviaPoints: '@higo/passenger/triviaPoints',
  tripHistoryCache: '@higo/passenger/tripHistoryCache',
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
    ]);
  },
};

export async function persistSession(user?: User): Promise<void> {
  if (user) {
    await AsyncStorage.setItem(KEYS.user, JSON.stringify(user));
  }
}

export async function loadPersistedSession(): Promise<{
  user: User | null;
}> {
  const userRaw = await AsyncStorage.getItem(KEYS.user);
  return {
    user: userRaw ? (JSON.parse(userRaw) as User) : null,
  };
}

export async function getStoredLanguage(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.language);
}

export async function setStoredLanguage(lang: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.language, lang);
}

export async function getStoredTriviaPoints(): Promise<number> {
  const points = await AsyncStorage.getItem(KEYS.triviaPoints);
  return points ? parseInt(points, 10) : 0;
}

export async function setStoredTriviaPoints(points: number): Promise<void> {
  await AsyncStorage.setItem(KEYS.triviaPoints, points.toString());
}

export async function getTripHistoryCache(): Promise<any> {
  const cache = await AsyncStorage.getItem(KEYS.tripHistoryCache);
  return cache ? JSON.parse(cache) : null;
}

export async function setTripHistoryCache(data: any): Promise<void> {
  await AsyncStorage.setItem(KEYS.tripHistoryCache, JSON.stringify(data));
}
