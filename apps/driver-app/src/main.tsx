import 'expo-dev-client';
import { AppRegistry } from 'react-native';
import crashlytics from '@react-native-firebase/crashlytics';
import App from './App';
import { initSentry, SentryRoot } from './services/sentry';

initSentry();
crashlytics().setCrashlyticsCollectionEnabled(true);

function Root() {
  return (
    <SentryRoot>
      <App />
    </SentryRoot>
  );
}

// Must be "main" -- Expo's generated native MainActivity.kt calls
// getMainComponentName() = "main" and looks up the JS component by that
// exact key. Any other name throws "Invariant Violation: main has not
// been registered" at native boot, before any JS error boundary can help.
AppRegistry.registerComponent('main', () => Root);
