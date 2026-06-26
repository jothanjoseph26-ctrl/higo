import 'expo-dev-client';
import { AppRegistry } from 'react-native';
import App from './App';
import { initSentry, SentryRoot } from './services/sentry';

initSentry();

function Root() {
  return (
    <SentryRoot>
      <App />
    </SentryRoot>
  );
}

AppRegistry.registerComponent('DriverApp', () => Root);
