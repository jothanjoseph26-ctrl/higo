import { AppRegistry } from 'react-native';
import App from './application/App';
import { initSentry, SentryRoot } from './services/sentry';

initSentry();

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
