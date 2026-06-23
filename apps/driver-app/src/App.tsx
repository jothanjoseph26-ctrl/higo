import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { I18nextProvider } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import { RootStack } from './navigation/RootStack';
import i18n, { initI18n } from './i18n';
import { useQueueStore } from './stores/queueStore';
import { theme } from './theme';

export default function App() {
  const [ready, setReady] = useState(false);
  const hydrateQueue = useQueueStore((s) => s.hydrate);

  useEffect(() => {
    void (async () => {
      await Promise.all([initI18n(), hydrateQueue()]);
      setReady(true);
    })();
  }, [hydrateQueue]);

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
    <I18nextProvider i18n={i18n}>
      <NavigationContainer>
        <RootStack />
      </NavigationContainer>
    </I18nextProvider>
  );
}