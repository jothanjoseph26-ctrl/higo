export const ALLOWED_DOMAINS = [
  'ride.hiconnectgo.com',
  'pilot.hiconnectgo.com',
  'portal.hiconnectgo.com',
  'api.hiconnectgo.com',
  'hiconnectgo.com',
];

export const APP_URL = process.env.EXPO_PUBLIC_APP_URL ?? 'https://ride.hiconnectgo.com';

export function isAllowedUrl(url: string): boolean {
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol !== 'https:') return false;
    return ALLOWED_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}
