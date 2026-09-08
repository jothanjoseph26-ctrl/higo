import React, { useEffect, useState, useRef } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { WebViewShell } from '../webview/WebViewShell';
import { BRIDGE_INJECTED_JS, deliverToWebView, parseBridgeMessage } from '../webview/bridge';
import { setupFCMHandlers, registerFCM } from '../services/fcm';
import { reconnectSocket } from '../services/socket';
import { OfflineManager } from '../services/offline';
import { theme } from '../theme';

export function App() {
  const [ready, setReady] = useState(false);
  const webViewRef = useRef<WebView>(null);
  const pendingNotificationRef = useRef<Record<string, unknown> | null>(null);

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    OfflineManager.init();
    setupFCMHandlers({ isReady: () => false, navigate: () => {} });
    void registerFCM();

    const Notifications = require('expo-notifications');

    Notifications.getLastNotificationResponseAsync().then((response: any) => {
      if (!response) return;
      const data = response.notification.request.content.data as Record<string, unknown>;
      const type = typeof data?.type === 'string' ? data.type : '';
      if (data?.tripId) {
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

    const responseSub = Notifications.addNotificationResponseReceivedListener((response: any) => {
      const data = response.notification.request.content.data as Record<string, unknown>;
      if (data?.tripId) {
        const payload = { type: data?.type, tripId: data.tripId as string };
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
      responseSub.remove();
    };
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        reconnectSocket().catch(() => {});
        webViewRef.current?.injectJavaScript(
          `window.__higo_reconnect_socket?.(); true;`
        );
      }
    });
    return () => sub.remove();
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
        <ActivityIndicator size="large" color={theme.colors.primaryGreen} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <WebViewShell webViewRef={webViewRef} onWebViewLoad={handleWebViewLoad} />
    </SafeAreaProvider>
  );
}

export default App;
