import { create } from 'zustand';
import axios from 'axios';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'super_admin' | 'admin' | 'moderator';
}

interface AuthState {
  admin: AdminUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  setAuth: (admin: AdminUser, token: string) => void;
  clearAuth: () => void;
  setInitializing: (val: boolean) => void;
  /** Attempt to restore session from httpOnly cookie on app mount */
  restoreSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  admin: null,
  accessToken: null,
  isAuthenticated: false,
  isInitializing: true,
  setAuth: (admin, token) =>
    set({ admin, accessToken: token, isAuthenticated: true, isInitializing: false }),
  clearAuth: () =>
    set({ admin: null, accessToken: null, isAuthenticated: false, isInitializing: false }),
  setInitializing: (val) => set({ isInitializing: val }),
  restoreSession: async () => {
    try {
      const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
      const response = await axios.post<{ success: boolean; data?: { accessToken: string; user?: AdminUser; admin?: AdminUser } }>(
        `${baseURL}/auth/refresh`,
        {}, // Empty body — server reads httpOnly cookie
        {
          withCredentials: true,
          headers: { 'x-client-platform': 'web' },
        },
      );

      if (response.data.success && response.data.data) {
        const accessToken = response.data.data.accessToken;
        const admin = response.data.data.user ?? response.data.data.admin;
        if (accessToken && admin) {
          set({
            admin: admin as AdminUser,
            accessToken,
            isAuthenticated: true,
            isInitializing: false,
          });
          return;
        }
      }
    } catch {
      // Refresh failed — no valid cookie, stay logged out
    }
    set({ isInitializing: false });
  },
}));
