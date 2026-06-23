import { io, Socket } from 'socket.io-client';
import { Platform } from 'react-native';
import { tokenStorage } from './storage';
import { API_BASE_URL, API_BASE_URL_ANDROID_EMULATOR } from '../config';
import { ClientToServerEvents, ServerToClientEvents } from '@higo/shared-types';

const getBaseUrl = () => {
  return Platform.OS === 'android' ? API_BASE_URL_ANDROID_EMULATOR : API_BASE_URL;
};

export const SOCKET_URL = getBaseUrl().replace('/api', '');

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export async function connectSocket(): Promise<Socket<ServerToClientEvents, ClientToServerEvents>> {
  if (socket?.connected) return socket;

  const accessToken = await tokenStorage.getAccessToken();

  socket = io(SOCKET_URL, {
    transports: ['websocket'],
    auth: {
      token: accessToken ? `Bearer ${accessToken}` : '',
    },
    autoConnect: false,
  });

  socket.connect();
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> | null {
  return socket;
}
