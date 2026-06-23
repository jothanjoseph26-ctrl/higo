import { io, Socket } from 'socket.io-client';
import { WS_BASE_URL } from '../config';
import { tokenStorage } from './storage';
import { useTripStore } from '../stores/tripStore';
import { useNotificationStore } from '../stores/notificationStore';
import { api } from './api';
import {
  SOCKET_EVENTS,
  ClientToServerEvents,
  ServerToClientEvents,
  TripStatus,
} from '@higo/shared-types';

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
let reconnectTimer: any = null;
let backoffMs = 1000;

export async function connectSocket(): Promise<Socket<ServerToClientEvents, ClientToServerEvents>> {
  if (socket?.connected) return socket;

  const accessToken = await tokenStorage.getAccessToken();

  socket = io(WS_BASE_URL, {
    transports: ['websocket'],
    auth: {
      token: accessToken ? `Bearer ${accessToken}` : '',
    },
    autoConnect: false,
    reconnection: false, // We handle reconnection logic manually with exponential backoff
  });

  socket.on('connect', () => {
    backoffMs = 1000;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    // Reconcile trip status on successful connection if there's a active/requested trip
    void reconcileTripStatus();
  });

  socket.on('disconnect', () => {
    scheduleReconnection();
  });

  socket.on('connect_error', () => {
    scheduleReconnection();
  });

  // Handle active trip socket events
  socket.on(SOCKET_EVENTS.TRIP_MATCHED as any, (payload: any) => {
    const { tripStore } = require('../stores/tripStore'); // lazy import to prevent circular deps
    const store = useTripStore.getState();
    store.setStatus(TripStatus.MATCHED);
    store.setDriverDetails(payload.driverDetails);
    store.setEta(payload.eta);
  });

  socket.on(SOCKET_EVENTS.TRIP_DRIVER_LOCATION as any, (payload: any) => {
    const store = useTripStore.getState();
    store.updateDriverLocation({ lat: payload.lat, lng: payload.lng, bearing: payload.bearing });
    store.setEta(payload.eta);
  });

  socket.on(SOCKET_EVENTS.TRIP_DRIVER_ARRIVED as any, () => {
    const store = useTripStore.getState();
    store.setStatus(TripStatus.EN_ROUTE); // driver arrived at pickup
  });

  socket.on(SOCKET_EVENTS.TRIP_STARTED as any, () => {
    const store = useTripStore.getState();
    store.setStatus(TripStatus.ACTIVE);
  });

  socket.on(SOCKET_EVENTS.TRIP_COMPLETED as any, (payload: any) => {
    const store = useTripStore.getState();
    store.setStatus(TripStatus.COMPLETED);
    if (store.currentTrip) {
      store.setCurrentTrip({
        ...store.currentTrip,
        status: TripStatus.COMPLETED,
        fare: payload.fare,
      });
    }
  });

  socket.on(SOCKET_EVENTS.TRIP_CANCELLED as any, () => {
    const store = useTripStore.getState();
    store.setStatus(TripStatus.CANCELLED);
  });

  socket.on(SOCKET_EVENTS.TRIP_NO_DRIVERS_AVAILABLE as any, () => {
    const store = useTripStore.getState();
    store.setStatus(null); // Return to booking/retry UI
  });

  socket.on(SOCKET_EVENTS.NOTIFICATION_GENERAL as any, (payload: any) => {
    const pushNotification = useNotificationStore.getState().push;
    pushNotification({
      title: payload.title,
      body: payload.body,
      type: payload.type,
      data: payload.data,
    });
  });

  socket.connect();
  return socket;
}

function scheduleReconnection() {
  if (reconnectTimer) return;

  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    if (!socket || socket.connected) return;

    // Refresh auth token
    const accessToken = await tokenStorage.getAccessToken();
    if (socket) {
      socket.auth = {
        token: accessToken ? `Bearer ${accessToken}` : '',
      };
      socket.connect();
    }

    // Exponential backoff 1s -> 2s -> 4s -> 8s ... up to 30s
    backoffMs = Math.min(backoffMs * 2, 30000);
  }, backoffMs);
}

async function reconcileTripStatus() {
  const store = useTripStore.getState();
  const activeTrip = store.currentTrip;
  if (!activeTrip) return;

  try {
    const statusInfo = await api.getTripStatus(activeTrip.id);
    store.setStatus(statusInfo.status as TripStatus);
    if (statusInfo.driver) {
      store.setDriverDetails(statusInfo.driver);
    }
    if (statusInfo.driverLocation) {
      store.updateDriverLocation({
        lat: statusInfo.driverLocation.lat,
        lng: statusInfo.driverLocation.lng,
        bearing: statusInfo.driverLocation.bearing,
      });
      if (statusInfo.driverLocation.etaMin !== undefined) {
        store.setEta(statusInfo.driverLocation.etaMin);
      }
    }
  } catch (error) {
    console.error('Failed to reconcile active trip status on reconnect', error);
  }
}

export function disconnectSocket() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> | null {
  return socket;
}
