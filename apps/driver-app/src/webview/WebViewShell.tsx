import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Linking, Platform, StyleSheet, View } from 'react-native';
import { WebView, type WebViewNavigation, type WebViewMessageEvent } from 'react-native-webview';
import * as Location from 'expo-location';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as Sharing from 'expo-sharing';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import Constants from 'expo-constants';
import { ALLOWED_DOMAINS, APP_URL, isAllowedUrl } from './allowedDomains';
import { BRIDGE_INJECTED_JS, deliverToWebView, parseBridgeMessage } from './bridge';
import { OfflineScreen } from './OfflineScreen';
import { startActiveTripTracking, stopActiveTripTracking } from './backgroundLocation';
import { theme } from '../theme';

type Props = {
  appUrl?: string;
};

export function WebViewShell({ appUrl = APP_URL }: Props) {
  const webViewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack) {
        webViewRef.current?.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  const respond = useCallback((requestId: string, payload: Record<string, unknown>) => {
    webViewRef.current?.injectJavaScript(deliverToWebView({ requestId, ...payload }));
  }, []);

  const handleMessage = useCallback(
    async (event: WebViewMessageEvent) => {
      const request = parseBridgeMessage(event.nativeEvent.data);
      if (!request) return;
      const { type, requestId, payload } = request;

      switch (type) {
        case 'GET_PUSH_TOKEN': {
          try {
            const { status } = await Notifications.requestPermissionsAsync();
            if (status !== 'granted') {
              respond(requestId, { ok: false, error: 'permission_denied' });
              return;
            }
            const projectId = Constants.expoConfig?.extra?.eas?.projectId;
            const token = await Notifications.getExpoPushTokenAsync({ projectId });
            respond(requestId, { ok: true, token: token.data });
          } catch (err) {
            respond(requestId, { ok: false, error: String(err) });
          }
          return;
        }
        case 'REQUEST_LOCATION': {
          try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
              respond(requestId, { ok: false, error: 'permission_denied' });
              return;
            }
            const pos = await Location.getCurrentPositionAsync({});
            respond(requestId, {
              ok: true,
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            });
          } catch (err) {
            respond(requestId, { ok: false, error: String(err) });
          }
          return;
        }
        case 'OPEN_EXTERNAL_URL': {
          const url = typeof payload?.url === 'string' ? payload.url : '';
          if (url.startsWith('https://') || url.startsWith('http://')) {
            await Linking.openURL(url);
            respond(requestId, { ok: true });
          } else {
            respond(requestId, { ok: false, error: 'invalid_url' });
          }
          return;
        }
        case 'SHARE_TRIP': {
          try {
            const url = typeof payload?.url === 'string' ? payload.url : undefined;
            if (url && (await Sharing.isAvailableAsync())) {
              await Sharing.shareAsync(url);
              respond(requestId, { ok: true });
            } else {
              respond(requestId, { ok: false, error: 'sharing_unavailable' });
            }
          } catch (err) {
            respond(requestId, { ok: false, error: String(err) });
          }
          return;
        }
        case 'GET_DEVICE_INFO': {
          respond(requestId, {
            ok: true,
            osName: Device.osName,
            osVersion: Device.osVersion,
            modelName: Device.modelName,
            appVersion: Constants.expoConfig?.version,
          });
          return;
        }
        case 'OPEN_APP_SETTINGS': {
          await Linking.openSettings();
          respond(requestId, { ok: true });
          return;
        }
        case 'OPEN_CAMERA': {
          try {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
              respond(requestId, { ok: false, error: 'permission_denied' });
              return;
            }
            const result = await ImagePicker.launchCameraAsync({ quality: 0.7, base64: true });
            if (result.canceled || !result.assets?.[0]) {
              respond(requestId, { ok: false, error: 'canceled' });
              return;
            }
            respond(requestId, {
              ok: true,
              base64: result.assets[0].base64,
              mimeType: result.assets[0].mimeType ?? 'image/jpeg',
              fileName: result.assets[0].fileName ?? 'capture.jpg',
            });
          } catch (err) {
            respond(requestId, { ok: false, error: String(err) });
          }
          return;
        }
        case 'SELECT_DOCUMENT': {
          try {
            const result = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'] });
            if (result.canceled || !result.assets?.[0]) {
              respond(requestId, { ok: false, error: 'canceled' });
              return;
            }
            const asset = result.assets[0];
            respond(requestId, {
              ok: true,
              uri: asset.uri,
              mimeType: asset.mimeType ?? 'application/octet-stream',
              fileName: asset.name,
              size: asset.size,
            });
          } catch (err) {
            respond(requestId, { ok: false, error: String(err) });
          }
          return;
        }
        case 'START_ACTIVE_TRIP_TRACKING': {
          const token = typeof payload?.authToken === 'string' ? payload.authToken : '';
          const tripId = typeof payload?.tripId === 'string' ? payload.tripId : undefined;
          if (!token) {
            respond(requestId, { ok: false, error: 'missing_auth_token' });
            return;
          }
          const result = await startActiveTripTracking(token, tripId);
          respond(requestId, result);
          return;
        }
        case 'STOP_ACTIVE_TRIP_TRACKING': {
          const result = await stopActiveTripTracking();
          respond(requestId, result);
          return;
        }
        default:
          respond(requestId, { ok: false, error: 'unsupported_command' });
      }
    },
    [respond],
  );

  const handleShouldStartLoad = useCallback((navState: WebViewNavigation | { url: string }) => {
    if (isAllowedUrl(navState.url)) return true;
    Linking.openURL(navState.url).catch(() => {});
    return false;
  }, []);

  if (loadError) {
    return <OfflineScreen onRetry={() => { setLoadError(false); setReloadKey((k) => k + 1); }} />;
  }

  return (
    <View style={styles.container}>
      <WebView
        key={reloadKey}
        ref={webViewRef}
        source={{ uri: appUrl }}
        originWhitelist={ALLOWED_DOMAINS.map((d) => `https://*.${d}`).concat(ALLOWED_DOMAINS.map((d) => `https://${d}`))}
        injectedJavaScriptBeforeContentLoaded={BRIDGE_INJECTED_JS}
        onMessage={handleMessage}
        onNavigationStateChange={(nav) => setCanGoBack(nav.canGoBack)}
        onShouldStartLoadWithRequest={handleShouldStartLoad}
        onError={() => setLoadError(true)}
        onHttpError={(e) => {
          if (e.nativeEvent.statusCode >= 500) setLoadError(true);
        }}
        startInLoadingState
        renderLoading={() => <View style={[styles.container, { backgroundColor: theme.colors.lightGrey }]} />}
        allowsBackForwardNavigationGestures
        setSupportMultipleWindows={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
