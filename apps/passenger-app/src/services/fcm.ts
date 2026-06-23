import { useNotificationStore } from '../stores/notificationStore';
import { useAuthStore } from '../stores/authStore';

export async function registerFCM() {
  try {
    // In a fully native environment, this would call messaging().getToken()
    // Here we generate a mock FCM token for local development and emulation
    const mockFcmToken = 'fcm-token-' + Math.random().toString(36).substring(7);
    
    const { user, updateProfile } = useAuthStore.getState();
    if (user && user.fcmToken !== mockFcmToken) {
      await updateProfile({ fcmToken: mockFcmToken });
      console.log('FCM Token registered with backend:', mockFcmToken);
    }
    return mockFcmToken;
  } catch (error) {
    console.error('Failed to register FCM token', error);
    return null;
  }
}

export function setupFCMHandlers(navigationRef: any) {
  // Simulates push notifications arriving
  console.log('Push notification listeners initialized');
  
  // Foreground message handler mock
  const handleForegroundMessage = (message: { title: string; body: string; type: string; data?: any }) => {
    const pushNotification = useNotificationStore.getState().push;
    pushNotification({
      title: message.title,
      body: message.body,
      type: message.type,
      data: message.data,
    });
  };

  // Background/Killed state notification tap handler mock
  const handleNotificationTap = (message: { type: string; data?: any }) => {
    if (!navigationRef.isReady()) return;

    if (message.type === 'trip:matched' || message.type === 'trip:started') {
      navigationRef.navigate('TripActive');
    } else if (message.type === 'chat') {
      navigationRef.navigate('ChatSupport');
    }
  };

  return {
    handleForegroundMessage,
    handleNotificationTap,
  };
}
