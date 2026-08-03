import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { io, type Socket } from 'socket.io-client';

const TASK_NAME = 'higo-driver-location-task';
const SOCKET_URL = 'https://api.hiconnectgo.com';

let socket: Socket | null = null;
let activeTripId: string | undefined;

function ensureSocket(token: string): Socket {
  if (socket?.connected) return socket;
  socket?.disconnect();
  socket = io(SOCKET_URL, { auth: { token }, transports: ['websocket'] });
  return socket;
}

// Must be registered at module load time (before any background launch event),
// not inside a component -- this file is imported once from App.tsx.
TaskManager.defineTask(TASK_NAME, ({ data, error }) => {
  if (error || !socket) return;
  const { locations } = (data as { locations?: Location.LocationObject[] }) ?? {};
  const loc = locations?.[locations.length - 1];
  if (!loc) return;
  socket.emit('driver:location_update', {
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    bearing: loc.coords.heading ?? undefined,
    speed: loc.coords.speed ?? undefined,
    tripId: activeTripId,
  });
});

export async function startActiveTripTracking(
  token: string,
  tripId?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
  if (fgStatus !== 'granted') return { ok: false, error: 'foreground_permission_denied' };

  const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
  if (bgStatus !== 'granted') return { ok: false, error: 'background_permission_denied' };

  activeTripId = tripId;
  ensureSocket(token);

  const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
  if (alreadyStarted) await Location.stopLocationUpdatesAsync(TASK_NAME);

  await Location.startLocationUpdatesAsync(TASK_NAME, {
    accuracy: Location.Accuracy.High,
    timeInterval: 5000,
    distanceInterval: 15,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'HiGO Driver',
      notificationBody: 'Sharing your location for an active trip',
    },
  });

  return { ok: true };
}

export async function stopActiveTripTracking(): Promise<{ ok: true }> {
  activeTripId = undefined;
  const started = await Location.hasStartedLocationUpdatesAsync(TASK_NAME);
  if (started) await Location.stopLocationUpdatesAsync(TASK_NAME);
  socket?.disconnect();
  socket = null;
  return { ok: true };
}
