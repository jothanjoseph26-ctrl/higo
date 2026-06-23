import { create } from 'zustand';
import type { Driver, User } from '@higo/shared-types';
import { api } from '../services/api';
import {
  loadPersistedSession,
  persistSession,
  tokenStorage,
} from '../services/storage';

interface DriverAuthState {
  user: User | null;
  driver: Driver | null;
  isAuthenticated: boolean;
  isHydrated: boolean;
  isLoading: boolean;
  isNewUser: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  sendOtp: (phone: string) => Promise<void>;
  verifyOtp: (phone: string, code: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useDriverAuthStore = create<DriverAuthState>((set, get) => ({
  user: null,
  driver: null,
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
      driver: session.driver,
      isAuthenticated: Boolean(token),
      isHydrated: true,
    });
  },

  async sendOtp(phone: string) {
    set({ isLoading: true, error: null });
    try {
      await api.sendOtp({ phone, userType: 'driver' });
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
      const result = await api.verifyOtp({ phone, code, userType: 'driver' });
      await persistSession(result.user, result.driver);
      set({
        user: result.user ?? null,
        driver: result.driver ?? null,
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

  async logout() {
    try {
      await api.logout();
    } catch {
      await tokenStorage.clear();
    }
    set({
      user: null,
      driver: null,
      isAuthenticated: false,
    });
  },

  clearError() {
    set({ error: null });
  },
}));