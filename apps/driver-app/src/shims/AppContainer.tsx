/**
 * Web shim for react-native/Libraries/ReactNative/AppContainer
 *
 * This module is imported by react-native-screens for debug containers.
 * On web, we provide a pass-through component.
 */
import React from 'react';

function AppContainer({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

export default AppContainer;
