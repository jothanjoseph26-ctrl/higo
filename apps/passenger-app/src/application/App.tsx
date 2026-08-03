import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { WebViewShell } from '../webview/WebViewShell';
import { theme } from '../theme';
import { OfflineManager } from '../services/offline';

export function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      OfflineManager.init();
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
