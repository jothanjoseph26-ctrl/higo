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
  TripMatchedPayload,
  TripDriverLocationPayload,
  TripCompletedPayload,
  TripCancelledPayload,
  TripNoDriversAvailablePayload,
  TripMessageNewPayload,
  TripCounterFarePayload,
  TripCounterAcceptedPayload,
  TripCounterDeclinedPayload,
} from '@higo/shared-types';

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
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
    reconnection: false,
  });

  socket.on('connect', () => {
    backoffMs = 1000;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    void reconcileTripStatus();
  });

  socket.on('disconnect', () => {
    scheduleReconnection();
  });

  socket.on('connect_error', () => {
    scheduleReconnection();
  });

  socket.on(SOCKET_EVENTS.TRIP_MATCHED, (payload: TripMatchedPayload) => {
    const store = useTripStore.getState();
    store.setStatus(TripStatus.MATCHED);
    store.setDriverDetails(payload.driverDetails);
    store.setEta(payload.eta);
    if (store.currentTrip) {
      store.setCurrentTrip({
        ...store.currentTrip,
        status: TripStatus.MATCHED,
        driverId: payload.driverId,
      });
    }
  });

  socket.on(SOCKET_EVENTS.TRIP_DRIVER_LOCATION, (payload: TripDriverLocationPayload) => {
    const store = useTripStore.getState();
    store.updateDriverLocation({ lat: payload.lat, lng: payload.lng, bearing: payload.bearing });
    store.setEta(payload.eta);
  });

  socket.on(SOCKET_EVENTS.TRIP_DRIVER_ARRIVED_AT_PICKUP, () => {
    const store = useTripStore.getState();
    store.setStatus(TripStatus.ARRIVED);
  });

  socket.on(SOCKET_EVENTS.TRIP_STARTED, () => {
    const store = useTripStore.getState();
    store.setStatus(TripStatus.ACTIVE);
  });

  socket.on(SOCKET_EVENTS.TRIP_COMPLETED, (payload: TripCompletedPayload) => {
    const store = useTripStore.getState();
    store.setStatus(TripStatus.COMPLETED);
    if (store.currentTrip) {
      store.setCurrentTrip({
        ...store.currentTrip,
        status: TripStatus.COMPLETED,
        totalFare: payload.fare,
      });
    }
    // Terminal event — clear trip state after a brief delay so the UI can
    // render the completed/summary screen before state is reset.
    setTimeout(() => {
      useTripStore.getState().clearTripState();
    }, 2000);
  });

  socket.on(SOCKET_EVENTS.TRIP_CANCELLED, (payload: TripCancelledPayload) => {
    const store = useTripStore.getState();
    store.setStatus(TripStatus.CANCELLED);
    store.setTripError(
      payload.reason
        ? `Trip cancelled: ${payload.reason}`
        : 'Your trip was cancelled.',
    );
    if (store.currentTrip) {
      store.setCurrentTrip({
        ...store.currentTrip,
        status: TripStatus.CANCELLED,
      });
    }
    // Terminal event — clear all trip state after a brief delay so the UI
    // can show the cancelled message before data is wiped clean.
    setTimeout(() => {
      useTripStore.getState().clearTripState();
    }, 1500);
  });

  socket.on(SOCKET_EVENTS.TRIP_NO_DRIVERS_AVAILABLE, (_payload: TripNoDriversAvailablePayload) => {
    const store = useTripStore.getState();
    store.setStatus(null);
    store.setTripError('No drivers available nearby. Please try again later.');
  });

  socket.on(SOCKET_EVENTS.TRIP_COUNTER_FARE, (payload: TripCounterFarePayload) => {
    const store = useTripStore.getState();
    store.setCounterFare({
      tripId: payload.tripId,
      driverId: payload.driverId,
      driverName: payload.driverName,
      counterFare: payload.counterFare,
      originalFare: payload.originalFare,
    });
  });

  socket.on(SOCKET_EVENTS.TRIP_COUNTER_ACCEPTED, (payload: TripCounterAcceptedPayload) => {
    const store = useTripStore.getState();
    store.setCounterFare(null);
    if (store.currentTrip) {
      store.setCurrentTrip({
        ...store.currentTrip,
        totalFare: payload.finalFare,
      });
    }
  });

  socket.on(SOCKET_EVENTS.TRIP_COUNTER_DECLINED, (payload: TripCounterDeclinedPayload) => {
    const store = useTripStore.getState();
    store.setCounterFare(null);
  });

  socket.on(SOCKET_EVENTS.MESSAGE_NEW, (payload: TripMessageNewPayload) => {
    // TripChat screen subscribes directly; hook kept for future global badge/toast.
    console.debug('Trip message received', payload.tripId, payload.message.id);
  });

  socket.on(SOCKET_EVENTS.NOTIFICATION_GENERAL, (payload) => {
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

    const accessToken = await tokenStorage.getAccessToken();
    if (socket) {
      socket.auth = {
        token: accessToken ? `Bearer ${accessToken}` : '',
      };
      socket.connect();
    }

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

export async function reconnectSocket(): Promise<void> {
  if (socket?.connected) return;
  const accessToken = await tokenStorage.getAccessToken();
  if (socket) {
    socket.auth = {
      token: accessToken ? `Bearer ${accessToken}` : '',
    };
    socket.connect();
  } else {
    await connectSocket();
  }
}