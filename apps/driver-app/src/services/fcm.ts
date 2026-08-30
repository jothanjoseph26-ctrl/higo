import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { api } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let lastRegisteredToken: string | null = null;

const FIREBASE_APP_NOT_READY = /firebase\s*app|firebase messaging instance/i;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// On cold start, native FirebaseApp initialization can still be in flight
// when this runs, causing getDevicePushTokenAsync() to throw. Retry with
// backoff before giving up so the race doesn't silently drop registration.
export async function getDevicePushTokenWithRetry(maxAttempts = 4): Promise<string> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const deviceToken = await Notifications.getDevicePushTokenAsync();
      return deviceToken.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt === maxAttempts || !FIREBASE_APP_NOT_READY.test(message)) {
        throw error;
      }
      await delay(500 * attempt);
    }
  }
  throw new Error('Unreachable');
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return false;
  }

  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') {
      return true;
    }

    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('Failed to request notification permission', error);
    return false;
  }
}

async function resolveFcmToken(): Promise<string | null> {
  if (Platform.OS === 'web' || !Device.isDevice) {
    return null;
  }

  const granted = await requestNotificationPermission();
  if (!granted) {
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('trip_requests_v2', {
      name: 'Ride Requests',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1B7A3E',
      sound: 'ring',
    });
  }

  return getDevicePushTokenWithRetry();
}

export async function registerFCM(): Promise<string | null> {
  try {
    const token = await resolveFcmToken();
    if (!token || token === lastRegisteredToken) {
      return token;
    }

    await api.request({
      method: 'PUT',
      url: '/drivers/me',
      data: { fcmToken: token },
    });

    lastRegisteredToken = token;
    console.log('Driver FCM token registered');
    return token;
  } catch (error) {
    console.error('Failed to register driver FCM token', error);
    return null;
  }
}

export function setupFCMHandlers(): () => void {
  const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
    const data = notification.request.content.data as Record<string, unknown>;
    const type = typeof data?.type === 'string' ? data.type : '';
    console.log('Foreground push received', notification.request.content.title, type);
    // Ring starts from socket TRIP_NEW_REQUEST via RingManager — not here.
  });

  const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as Record<string, unknown>;
    const type = typeof data?.type === 'string' ? data.type : '';
    console.log('Notification tapped', type);
    // Ring starts when WebView socket reconnects and delivers TRIP_NEW_REQUEST — not here.
  });

  return () => {
    receivedSub.remove();
    responseSub.remove();
  };
}