import { AppRegistry } from 'react-native';
import App from './App';
import { initSentry, SentryRoot } from './services/sentry';

initSentry();

try {
  const crashlytics = require('@react-native-firebase/crashlytics').default;
  crashlytics().setCrashlyticsCollectionEnabled(true);
} catch (e) {
  console.warn('Crashlytics init failed (non-fatal):', e);
}

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
