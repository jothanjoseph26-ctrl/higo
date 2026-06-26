import { create } from 'zustand';
import type { User } from '@higo/shared-types';
import { Platform } from 'react-native';
import { api } from '../services/api';
import {
  sendFirebasePhoneOtp,
  verifyFirebasePhoneOtp,
} from '../services/firebase-phone-auth';
import {
  loadPersistedSession,
  persistSession,
  tokenStorage,
  getStoredLanguage,
  setStoredLanguage,
} from '../services/storage';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isHydrated: boolean;
  isLoading: boolean;
  isNewUser: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  sendOtp: (phone: string) => Promise<void>;
  verifyOtp: (phone: string, code: string) => Promise<boolean>;
  updateProfile: (data: { name?: string; email?: string; preferredLanguage?: string; fcmToken?: string }) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isHydrated: false,
  isLoading: false,
  isNewUser: false,
  error: null,

  async hydrate() {
    const [token, session] = await Promise.all([
      tokenStorage.getAccessToken(),
      loadPersistedSession(),
    ]);
    set({
      user: session.user,
      isAuthenticated: Boolean(token),
      isHydrated: true,
    });
  },

  async sendOtp(phone: string) {
    set({ isLoading: true, error: null });
    try {
      if (Platform.OS === 'web') {
        await sendFirebasePhoneOtp(phone);
      } else {
        await api.sendOtp({ phone, userType: 'passenger' });
      }
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to send OTP',
      });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  async verifyOtp(phone: string, code: string) {
    set({ isLoading: true, error: null });
    try {
      const result =
        Platform.OS === 'web'
          ? await api.verifyFirebasePhone({
              idToken: await verifyFirebasePhoneOtp(code),
              userType: 'passenger',
            })
          : await api.verifyOtp({ phone, code, userType: 'passenger' });
      await persistSession(result.user);
      set({
        user: result.user ?? null,
        isAuthenticated: true,
        isNewUser: result.isNewUser,
      });
      return result.isNewUser;
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Invalid OTP',
      });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  async updateProfile(data: { name?: string; email?: string; preferredLanguage?: any; fcmToken?: string }) {
    set({ isLoading: true, error: null });
    try {
      const updatedUser = await api.updateProfile(data);
      await persistSession(updatedUser);
      set({ user: updatedUser });
      if (data.preferredLanguage) {
        await setStoredLanguage(data.preferredLanguage);
      }
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to update profile',
      });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  async logout() {
    try {
      await api.logout();
    } catch {
      await tokenStorage.clear();
    }
    set({
      user: null,
      isAuthenticated: false,
    });
  },

  clearError() {
    set({ error: null });
  },
}));
