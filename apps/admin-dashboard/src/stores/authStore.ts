import { create } from 'zustand';

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
}

export const useAuthStore = create<AuthState>((set) => ({
  admin: null,
  accessToken: null,
  isAuthenticated: false,
  isInitializing: true,
  setAuth: (admin, token) =>
    set({ admin, accessToken: token, isAuthenticated: true, isInitializing: false }),
  clearAuth: () =>
    set({ admin: null, accessToken: null, isAuthenticated: false, isInitializing: false }),
  setInitializing: (val) => set({ isInitializing: val }),
}));
