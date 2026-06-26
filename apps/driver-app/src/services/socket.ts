import { io, Socket } from 'socket.io-client';
import { Platform } from 'react-native';
import { tokenStorage } from './storage';
import { API_BASE_URL, API_BASE_URL_ANDROID_EMULATOR } from '../config';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  SOCKET_EVENTS,
  TripStatus,
} from '@higo/shared-types';
import { useTripStore } from '../stores/tripStore';
import { navigateToTab, navigateToTripRequest } from '../navigation/navigationRef';

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
    navigateToTripRequest();
  });

  sock.on(SOCKET_EVENTS.TRIP_STARTED, (payload) => {
    useTripStore.getState().handleTripStarted(payload);
  });

  sock.on(SOCKET_EVENTS.TRIP_COMPLETED, (payload) => {
    useTripStore.getState().handleTripCompleted(payload);
  });

  sock.on(SOCKET_EVENTS.TRIP_CANCELLED, (payload) => {
    void useTripStore.getState().handleTripCancelled(payload);
    navigateToTab();
  });

  sock.on(SOCKET_EVENTS.TRIP_DRIVER_ARRIVED, (payload) => {
    useTripStore.getState().handleTripDriverArrived(payload);
  });

  sock.on(SOCKET_EVENTS.AUTH_ERROR, (payload) => {
    console.error('Socket auth error:', payload.message);
  });

  sock.on(SOCKET_EVENTS.MESSAGE_NEW, (payload) => {
    console.debug('Trip message received', payload.tripId, payload.message.id);
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