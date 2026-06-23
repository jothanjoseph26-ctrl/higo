import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';
import { useOpsMapStore } from '../stores/opsMapStore';
import { SOCKET_EVENTS, ROOMS } from '@higo/shared-types';

let socket: Socket | null = null;

export const getSocket = (): Socket | null => {
  return socket;
};

export const initSocket = (): Socket => {
  if (socket) {
    return socket;
  }

  const url = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';
  const token = useAuthStore.getState().accessToken;

  socket = io(url, {
    auth: {
      token: token ? token : '',
    },
    autoConnect: false,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity,
  });

  socket.on('connect', () => {
    console.log('Socket connected, joining admin:ops room');
    socket?.emit('join', { room: ROOMS.adminOps() });
  });

  socket.on(SOCKET_EVENTS.TRIP_DRIVER_LOCATION, (data: any) => {
    // Updates marker location on map
    useOpsMapStore.getState().upsertDriver(data.driverId, {
      location: { lat: data.lat, lng: data.lng },
      bearing: data.bearing,
    });
  });

  socket.on(SOCKET_EVENTS.TRIP_MATCHED, (data: any) => {
    useOpsMapStore.getState().upsertDriver(data.driverId, {
      driverId: data.driverId,
      name: data.driverDetails.name,
      phone: data.driverDetails.phone,
      vehiclePlate: data.driverDetails.vehiclePlate,
      isOnline: true,
    });
  });

  socket.on(SOCKET_EVENTS.TRIP_COMPLETED, (data: any) => {
    useOpsMapStore.getState().removeTrip(data.tripId);
  });

  socket.on(SOCKET_EVENTS.TRIP_CANCELLED, (data: any) => {
    useOpsMapStore.getState().removeTrip(data.tripId);
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected');
  });

  socket.on('connect_error', (error) => {
    console.error('Socket connect error:', error);
  });

  socket.connect();
  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
