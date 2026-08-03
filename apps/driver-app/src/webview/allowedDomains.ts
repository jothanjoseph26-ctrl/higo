export const ALLOWED_DOMAINS = [
  'ride.hiconnectgo.com',
  'pilot.hiconnectgo.com',
  'driver.hiconnectgo.com',
  'portal.hiconnectgo.com',
  'api.hiconnectgo.com',
  'hiconnectgo.com',
];

// Staging/dev builds point at pilot.hiconnectgo.com; production builds point
// at driver.hiconnectgo.com (set per-profile in eas.json). Falls back to the
// staging domain if the env var isn't injected (e.g. Expo Go / bare `expo start`).
export const APP_URL = process.env.EXPO_PUBLIC_APP_URL ?? 'https://pilot.hiconnectgo.com';

export function isAllowedUrl(url: string): boolean {
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol !== 'https:') return false;
    return ALLOWED_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}
