/**
 * Web shim for react-native/Libraries/Utilities/codegenNativeComponent
 *
 * This module is imported by packages like react-native-safe-area-context
 * to register native components. On web, we return a passthrough component
 * that renders children using a View.
 */
import React, { forwardRef } from 'react';
import { View } from 'react-native';

function codegenNativeComponent<P>(nativeComponentName: string, _options?: any) {
  return forwardRef<any, any>(({ children, ...props }, ref) => {
    return (
      <View ref={ref} {...props}>
        {children}
      </View>
    );
  });
}

export default codegenNativeComponent;
