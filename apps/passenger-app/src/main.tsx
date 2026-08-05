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

AppRegistry.registerComponent('PassengerApp', () => Root);
