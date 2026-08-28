import React, { useEffect, useState, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { WebViewShell } from './webview/WebViewShell';
import { BRIDGE_INJECTED_JS, deliverToWebView, parseBridgeMessage } from './webview/bridge';
import { setupFCMHandlers, registerFCM } from './services/fcm';
import { theme } from './theme';

export default function App() {
  const [ready, setReady] = useState(false);
  const webViewRef = useRef<WebView>(null);
  const pendingNotificationRef = useRef<Record<string, unknown> | null>(null);

  useEffect(() => {
    setReady(true);
  }, []);

  // Register FCM notification handlers (foreground + tap + cold-start)
  useEffect(() => {
    const cleanup = setupFCMHandlers();

    // Register a real FCM device token (via retry) so Firebase Admin can
    // reach this driver. Only FCM tokens are accepted - Expo tokens fail.
    registerFCM();

    const Notifications = require('expo-notifications');

    // Cold-start: app was terminated, notification tap launched it
    Notifications.getLastNotificationResponseAsync().then((response: any) => {
      if (!response) return;
      const data = response.notification.request.content.data as Record<string, unknown>;
      const type = typeof data?.type === 'string' ? data.type : '';
      if (type === 'trip:new_request' && data.tripId) {
        const payload = { type, tripId: data.tripId as string };
        if (webViewRef.current) {
          webViewRef.current.injectJavaScript(
            `window.dispatchEvent(new CustomEvent('higo-notification', { detail: ${JSON.stringify(payload)} })); true;`
          );
        } else {
          pendingNotificationRef.current = payload;
        }
      }
    });

    // Handle notification response (tap) — inject into WebView if ready, else store
    const responseSub = Notifications.addNotificationResponseReceivedListener((response: any) => {
      const data = response.notification.request.content.data as Record<string, unknown>;
      const type = typeof data?.type === 'string' ? data.type : '';
      if (type === 'trip:new_request' && data.tripId) {
        const payload = { type, tripId: data.tripId as string };
        if (webViewRef.current) {
          webViewRef.current.injectJavaScript(
            `window.dispatchEvent(new CustomEvent('higo-notification', { detail: ${JSON.stringify(payload)} })); true;`
          );
        } else {
          pendingNotificationRef.current = payload;
        }
      }
    });

    return () => {
      cleanup();
      responseSub.remove();
    };
  }, []);

  const handleWebViewLoad = () => {
    if (pendingNotificationRef.current) {
      const payload = pendingNotificationRef.current;
      pendingNotificationRef.current = null;
      setTimeout(() => {
        webViewRef.current?.injectJavaScript(
          `window.dispatchEvent(new CustomEvent('higo-notification', { detail: ${JSON.stringify(payload)} })); true;`
        );
      }, 500);
    }
  };

  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.lightGrey,
        }}
      >
        <ActivityIndicator size="large" color={theme.colors.darkNavy} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <WebViewShell webViewRef={webViewRef} onWebViewLoad={handleWebViewLoad} />
    </SafeAreaProvider>
  );
}
