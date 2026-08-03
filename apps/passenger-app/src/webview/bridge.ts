/**
 * Native bridge shim injected into the WebView before page load.
 *
 * The web app (Base44) sends commands via:
 *   window.HiGONative.postMessage({ type: 'GET_PUSH_TOKEN', requestId })
 *
 * and listens for responses via:
 *   window.addEventListener('higo-native-message', (e) => { e.detail })
 *
 * `window.HiGONative.postMessage` is a thin wrapper so the web app doesn't
 * need to know it's talking to react-native-webview specifically -- only
 * that `window.HiGONative` exists when running inside the native shell.
 */
export const BRIDGE_INJECTED_JS = `
(function () {
  if (window.HiGONative) return;
  window.HiGONative = {
    platform: '${process.env.EXPO_OS ?? 'native'}',
    postMessage: function (message) {
      window.ReactNativeWebView.postMessage(JSON.stringify(message));
    },
  };
  true;
})();
`;

export type BridgeRequest = {
  type: BridgeCommand;
  requestId: string;
  payload?: Record<string, unknown>;
};

export type BridgeCommand =
  | 'GET_PUSH_TOKEN'
  | 'OPEN_CAMERA'
  | 'SELECT_DOCUMENT'
  | 'OPEN_EXTERNAL_URL'
  | 'SHARE_TRIP'
  | 'REQUEST_LOCATION'
  | 'START_ACTIVE_TRIP_TRACKING'
  | 'STOP_ACTIVE_TRIP_TRACKING'
  | 'GET_DEVICE_INFO'
  | 'OPEN_APP_SETTINGS';

export function parseBridgeMessage(raw: string): BridgeRequest | null {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.type !== 'string' || typeof parsed?.requestId !== 'string') return null;
    return parsed as BridgeRequest;
  } catch {
    return null;
  }
}

/** JS injected back into the page to deliver a native response/event. */
export function deliverToWebView(payload: Record<string, unknown>): string {
  return `
(function () {
  window.dispatchEvent(new CustomEvent('higo-native-message', { detail: ${JSON.stringify(payload)} }));
})();
true;
`;
}
