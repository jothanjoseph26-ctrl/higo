const PROD_API = 'https://www.hiconnectgo.com/api';
const PROD_WS = 'https://www.hiconnectgo.com';

// EXPO_PUBLIC_* vars are inlined by Expo's Babel preset on native; the web
// build injects the same keys through Vite's `define` (see vite.config.mts).
// Hermes cannot parse `import.meta`, so it must never appear in shared code.
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || PROD_API;

export const API_ROOT_URL = API_BASE_URL.replace(/\/api\/?$/, '');

export const HEALTH_CHECK_URL = `${API_ROOT_URL}/health`;

export const WS_BASE_URL = process.env.EXPO_PUBLIC_SOCKET_URL || PROD_WS;
