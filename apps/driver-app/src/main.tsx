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

AppRegistry.registerComponent('DriverApp', () => Root);
