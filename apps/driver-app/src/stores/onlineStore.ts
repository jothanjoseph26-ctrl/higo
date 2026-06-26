import { create } from 'zustand';
import { api } from '../services/api';
import { connectSocket, disconnectSocket } from '../services/socket';
import { startBackgroundLocation, stopBackgroundLocation } from '../services/location-task';
import { useDriverAuthStore } from './driverAuthStore';
import { registerFCM } from '../services/fcm';

interface OnlineState {
  isOnline: boolean;
  isLoading: boolean;
  blockedReason: 'KYC_INCOMPLETE' | 'SUBSCRIPTION_EXPIRED' | 'DRIVER_SUSPENDED' | null;
  error: string | null;
  goOnline: () => Promise<boolean>;
  goOffline: () => Promise<void>;
  resetBlockedReason: () => void;
}

export const useOnlineStore = create<OnlineState>((set) => ({
  isOnline: false,
  isLoading: false,
  blockedReason: null,
  error: null,

  async goOnline() {
    set({ isLoading: true, error: null, blockedReason: null });
    try {
      await api.request({
        method: 'PUT',
        url: '/drivers/online-status',
        data: { isOnline: true },
      });

      const socket = await connectSocket();
      const lat = 9.0765;
      const lng = 7.3986;

      socket.emit('driver:go_online', { lat, lng });

      await startBackgroundLocation(false);
      await registerFCM();

      const currentDriver = useDriverAuthStore.getState().driver;
      if (currentDriver) {
        useDriverAuthStore.setState({
          driver: { ...currentDriver, isOnline: true },
        });
      }

      set({ isOnline: true });
      return true;
    } catch (err: any) {
      console.error('Failed to go online:', err);
      const code = err.code || err.response?.data?.error?.code;
      if (
        code === 'KYC_INCOMPLETE' ||
        code === 'SUBSCRIPTION_EXPIRED' ||
        code === 'DRIVER_SUSPENDED'
      ) {
        set({ blockedReason: code });
      } else {
        set({ error: err.message || 'Failed to go online' });
      }
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  async goOffline() {
    set({ isLoading: true, error: null });
    try {
      await api.request({
        method: 'PUT',
        url: '/drivers/online-status',
        data: { isOnline: false },
      });

      const socket = await connectSocket();
      socket.emit('driver:go_offline', {});
      disconnectSocket();

      await stopBackgroundLocation();

      const currentDriver = useDriverAuthStore.getState().driver;
      if (currentDriver) {
        useDriverAuthStore.setState({
          driver: { ...currentDriver, isOnline: false },
        });
      }

      set({ isOnline: false });
    } catch (err: any) {
      console.error('Failed to go offline:', err);
      set({ error: err.message || 'Failed to go offline' });
    } finally {
      set({ isLoading: false });
    }
  },

  resetBlockedReason() {
    set({ blockedReason: null });
  },
}));
