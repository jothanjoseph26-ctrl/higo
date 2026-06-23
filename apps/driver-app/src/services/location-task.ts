import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { getSocket } from './socket';
import { useQueueStore } from '../stores/queueStore';

export const LOCATION_TASK_NAME = 'background-location-task';

// Define the background location task
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: { data: any; error: any }) => {
  if (error) {
    console.error('Background location error:', error);
    return;
  }
  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    const loc = locations[0];
    if (!loc) return;

    const socket = getSocket();
    const payload = {
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      bearing: loc.coords.heading ?? undefined,
      speed: loc.coords.speed ?? undefined,
      recordedAt: new Date(loc.timestamp).toISOString(),
    };

    if (socket?.connected) {
      socket.emit('driver:location_update', payload);
    } else {
      // Offline-first: enqueue locations to job queue when socket is down
      await useQueueStore.getState().add('location_batch', payload);
    }
  }
});

export async function startBackgroundLocation(isActiveTrip: boolean) {
  const { status } = await Location.requestBackgroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Background location permission not granted');
  }

  // Active trip: 3s cadence. Online / idle: 10s cadence.
  const timeInterval = isActiveTrip ? 3000 : 10000;
  const distanceInterval = 5; // meters

  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval,
    distanceInterval,
    foregroundService: {
      notificationTitle: 'HiGo Driver Active',
      notificationBody: 'Sharing location for ride matching and safety.',
      notificationColor: '#00D85A',
    },
  });
}

export async function stopBackgroundLocation() {
  const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  if (hasStarted) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
}
