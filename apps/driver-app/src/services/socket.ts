import { io, Socket } from 'socket.io-client';
import { Platform } from 'react-native';
import { tokenStorage } from './storage';
import { API_BASE_URL, API_BASE_URL_ANDROID_EMULATOR } from '../config';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  SOCKET_EVENTS,
  TripStatus,
  TripCounterAcceptedPayload,
  TripCounterDeclinedPayload,
} from '@higo/shared-types';
import { useTripStore } from '../stores/tripStore';

const getBaseUrl = () => {
  return Platform.OS === 'android' ? API_BASE_URL_ANDROID_EMULATOR : API_BASE_URL;
};

export const SOCKET_URL = getBaseUrl().replace('/api', '');

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
let handlersRegistered = false;

function registerSocketHandlers(sock: Socket<ServerToClientEvents, ClientToServerEvents>) {
  if (handlersRegistered) return;
  handlersRegistered = true;

  sock.on(SOCKET_EVENTS.TRIP_NEW_REQUEST, (payload) => {
    console.log('Received new trip request via socket', payload);
    void useTripStore.getState().setIncomingRequest(payload);
  });

  sock.on(SOCKET_EVENTS.TRIP_STARTED, (payload) => {
    useTripStore.getState().handleTripStarted(payload);
  });

  sock.on(SOCKET_EVENTS.TRIP_COMPLETED, (payload) => {
    useTripStore.getState().handleTripCompleted(payload);
  });

  sock.on(SOCKET_EVENTS.TRIP_CANCELLED, (payload) => {
    void useTripStore.getState().handleTripCancelled(payload);
  });

  sock.on(SOCKET_EVENTS.TRIP_DRIVER_ARRIVED_AT_PICKUP, (payload) => {
    useTripStore.getState().handleTripDriverArrived(payload);
  });

  sock.on(SOCKET_EVENTS.AUTH_ERROR, (payload) => {
    console.error('Socket auth error:', payload.message);
  });

  sock.on(SOCKET_EVENTS.MESSAGE_NEW, (payload) => {
    console.debug('Trip message received', payload.tripId, payload.message.id);
  });

  sock.on(SOCKET_EVENTS.DRIVER_TRIP_ACCEPT_FAILED, (payload) => {
    console.log('Trip accept failed / timed out:', payload.tripId, payload.reason);
    void useTripStore.getState().setIncomingRequest(null);
  });

  sock.on(SOCKET_EVENTS.TRIP_COUNTER_ACCEPTED, (payload: TripCounterAcceptedPayload) => {
    console.log('Counter-fare accepted:', payload.tripId, payload.finalFare);
    const store = useTripStore.getState();
    // Passenger accepted our counter-offer — trip will be matched
    // The TRIP_MATCHED event will follow, so just log for now
  });

  sock.on(SOCKET_EVENTS.TRIP_COUNTER_DECLINED, (payload: TripCounterDeclinedPayload) => {
    console.log('Counter-fare declined:', payload.tripId);
    // Passenger declined our counter-offer — we can send another or wait
  });

  sock.on('connect', () => {
    console.log('[NativeSocket] Connected:', sock.id);
  });

  sock.on('disconnect', (reason) => {
    console.log('[NativeSocket] Disconnected:', reason);
  });
}

export async function connectSocket(): Promise<Socket<ServerToClientEvents, ClientToServerEvents>> {
  if (socket?.connected) return socket;

  if (!socket) {
    const accessToken = await tokenStorage.getAccessToken();

    socket = io(SOCKET_URL, {
      transports: ['websocket'],
      auth: {
        token: accessToken ? `Bearer ${accessToken}` : '',
      },
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    registerSocketHandlers(socket);
  } else {
    const accessToken = await tokenStorage.getAccessToken();
    socket.auth = {
      token: accessToken ? `Bearer ${accessToken}` : '',
    };
  }

  socket.connect();
  return socket;
}

/**
 * Force-reconnect the native socket. Called when the app returns to foreground
 * after being backgrounded — the OS may have killed the WebSocket.
 */
export async function reconnectSocket(): Promise<void> {
  if (socket?.connected) return;
  await connectSocket();
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    handlersRegistered = false;
  }
}

export function getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> | null {
  return socket;
}

/**
 * Send a counter-fare offer from driver to passenger.
 * Returns true if the emit was sent, false if socket is not connected.
 */
export function emitCounterFare(tripId: string, counterFare: number): boolean {
  if (!socket?.connected) return false;
  socket.emit(SOCKET_EVENTS.DRIVER_COUNTER_FARE, { tripId, counterFare });
  return true;
}