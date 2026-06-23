/**
 * Web wrapper for react-native that re-exports everything from react-native-web
 * and adds stubs for native-only APIs that aren't available in react-native-web
 * but are imported by native packages like react-native-image-picker.
 */

// Re-export everything from react-native-web
export * from 'react-native-web';

// Stub for TurboModuleRegistry (native-only, not available in react-native-web)
export const TurboModuleRegistry = {
  get: (_name: string) => null,
  getEnforcing: (_name: string) => {
    throw new Error(`TurboModuleRegistry.getEnforcing is not available on web`);
  },
};

// Stub for UIManager if not exported (some packages need it)
export const UIManager = {
  getViewManagerConfig: (_name: string) => null,
  hasViewManagerConfig: (_name: string) => false,
  dispatchViewManagerCommand: () => {},
  measure: () => {},
  measureInWindow: () => {},
  measureLayout: () => {},
};
