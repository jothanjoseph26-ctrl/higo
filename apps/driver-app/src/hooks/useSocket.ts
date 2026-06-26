import { useEffect } from 'react';
import { useDriverAuthStore } from '../stores/driverAuthStore';
import { useOnlineStore } from '../stores/onlineStore';
import { connectSocket, disconnectSocket } from '../services/socket';

/**
 * Central socket lifecycle hook — connects when the driver is authenticated and online.
 * Trip event handlers are registered inside connectSocket(); this hook only manages
 * the connection based on auth + online state.
 */
export function useSocket() {
  const isAuthenticated = useDriverAuthStore((s) => s.isAuthenticated);
  const isOnline = useOnlineStore((s) => s.isOnline);

  useEffect(() => {
    if (!isAuthenticated || !isOnline) {
      return;
    }

    void connectSocket();

    return () => {
      // goOffline() calls disconnectSocket(); avoid tearing down mid-trip here.
    };
  }, [isAuthenticated, isOnline]);

  useEffect(() => {
    if (!isAuthenticated) {
      disconnectSocket();
    }
  }, [isAuthenticated]);
}