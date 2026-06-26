import { create } from 'zustand';
import type { Driver, User } from '@higo/shared-types';
import {
  api,
  getDriverProfile,
  updateDriverProfile,
  type UpdateDriverProfilePayload,
} from '../services/api';
import {
  loadPersistedSession,
  persistSession,
  tokenStorage,
} from '../services/storage';

export function isVehicleProfileIncomplete(driver?: Driver | null): boolean {
  const plate = driver?.vehiclePlate?.trim();
  return !plate || plate === 'PENDING';
}

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
  refreshDriverProfile: () => Promise<Driver>;
  updateVehicleProfile: (payload: UpdateDriverProfilePayload) => Promise<Driver>;
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

  async refreshDriverProfile() {
    const driver = await getDriverProfile();
    const { user } = get();
    await persistSession(user ?? undefined, driver);
    set({ driver });
    return driver;
  },

  async updateVehicleProfile(payload: UpdateDriverProfilePayload) {
    const driver = await updateDriverProfile(payload);
    const { user } = get();
    await persistSession(user ?? undefined, driver);
    set({ driver });
    return driver;
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