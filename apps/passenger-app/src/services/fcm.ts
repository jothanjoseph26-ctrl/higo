import { Platform } from 'react-native';
import { useNotificationStore } from '../stores/notificationStore';
import { useAuthStore } from '../stores/authStore';

const useMock =
  Platform.OS === 'web' || process.env.EXPO_PUBLIC_PUSH_MOCK === 'true';

let lastRegisteredToken: string | null = null;

async function registerFCMMock(): Promise<string | null> {
  const mockFcmToken = 'fcm-token-' + Math.random().toString(36).substring(7);
  const { user, updateProfile } = useAuthStore.getState();

  if (user && user.fcmToken !== mockFcmToken) {
    await updateProfile({ fcmToken: mockFcmToken });
    console.log('FCM token registered with backend (mock):', mockFcmToken);
  }

  return mockFcmToken;
}

async function ensureNotificationHandler(): Promise<typeof import('expo-notifications')> {
  const Notifications = await import('expo-notifications');

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  return Notifications;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (useMock) {
    return true;
  }

  try {
    const Notifications = await ensureNotificationHandler();
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

async function registerFCMNative(): Promise<string | null> {
  const Notifications = await ensureNotificationHandler();
  const Device = await import('expo-device');
  if (!Device.isDevice) {
    return null;
  }

  const granted = await requestNotificationPermission();
  if (!granted) {
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1B7A3E',
    });
  }

  const deviceToken = await Notifications.getDevicePushTokenAsync();
  const token = deviceToken.data;

  const { user, updateProfile } = useAuthStore.getState();
  if (user && token !== lastRegisteredToken && user.fcmToken !== token) {
    await updateProfile({ fcmToken: token });
    lastRegisteredToken = token;
    console.log('FCM token registered with backend');
  }

  return token;
}

export async function registerFCM(): Promise<string | null> {
  try {
    if (useMock) {
      return registerFCMMock();
    }
    return registerFCMNative();
  } catch (error) {
    console.error('Failed to register FCM token', error);
    return null;
  }
}

export function setupFCMHandlers(navigationRef: {
  isReady: () => boolean;
  navigate: (name: string) => void;
}): () => void {
  if (useMock) {
    console.log('Push notification listeners initialized (mock)');
    return () => undefined;
  }

  let cleanup: (() => void) | undefined;

  void (async () => {
    const Notifications = await import('expo-notifications');

    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      const content = notification.request.content;
      const data = (content.data ?? {}) as Record<string, unknown>;
      const type = typeof data.type === 'string' ? data.type : 'general';

      useNotificationStore.getState().push({
        title: content.title ?? 'HiGo',
        body: content.body ?? '',
        type,
        data: data as Record<string, unknown>,
      });
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown>;
      const type = typeof data?.type === 'string' ? data.type : '';

      if (!navigationRef.isReady()) return;

      if (type === 'trip:matched' || type === 'trip:started') {
        navigationRef.navigate('TripActive');
      } else if (type === 'chat') {
        navigationRef.navigate('ChatSupport');
      }
    });

    cleanup = () => {
      receivedSub.remove();
      responseSub.remove();
    };
  })();

  return () => {
    cleanup?.();
  };
}