import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { api } from './api';
import { navigateToTripRequest } from '../navigation/navigationRef';

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
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1B7A3E',
    });
  }

  const deviceToken = await Notifications.getDevicePushTokenAsync();
  return deviceToken.data;
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
    console.log('Foreground push received', notification.request.content.title);
  });

  const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as Record<string, unknown>;
    const type = typeof data?.type === 'string' ? data.type : '';

    if (type === 'trip:new_request') {
      navigateToTripRequest();
    }
  });

  return () => {
    receivedSub.remove();
    responseSub.remove();
  };
}