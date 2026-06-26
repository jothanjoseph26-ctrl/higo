import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { I18nextProvider } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import { enableScreens } from 'react-native-screens';
import { RootStack } from '../navigation/RootStack';
import { navigationRef } from '../navigation/navigationRef';
import i18n, { initI18n } from '../i18n';
import { theme } from '../theme';
import { linking } from '../navigation/linking';
import { OfflineManager } from '../services/offline';

enableScreens(false);

export function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      await initI18n();
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
    <I18nextProvider i18n={i18n}>
      <NavigationContainer linking={linking} ref={navigationRef}>
        <RootStack />
      </NavigationContainer>
    </I18nextProvider>
  );
}

export default App;
