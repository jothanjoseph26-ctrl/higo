/**
 * Web shim for react-native/Libraries/Utilities/codegenNativeComponent
 *
 * This module is imported by packages like react-native-safe-area-context
 * to register native components. On web, we return a no-op factory.
 */
import { forwardRef } from 'react';

function codegenNativeComponent<P>(nativeComponentName: string, _options?: any) {
  // Return a stub component that renders nothing
  return forwardRef<any, P>((_props, _ref) => null);
}

export default codegenNativeComponent;
