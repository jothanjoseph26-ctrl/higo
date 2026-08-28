import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { WebViewShell } from '../webview/WebViewShell';
import { theme } from '../theme';
import { OfflineManager } from '../services/offline';
import { registerFCM, setupFCMHandlers } from '../services/fcm';

export function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      OfflineManager.init();
      // Phase 1: register real FCM token (no mock) for passenger native
      setupFCMHandlers({ isReady: () => false, navigate: () => {} });
      void registerFCM();
      setReady(true);
    })();
  }, []);

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
      <WebViewShell />
    </SafeAreaProvider>
  );
}

export default App;
