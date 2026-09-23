import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const INSTALLATION_ID_KEY = '@higo/installationId';

export type NativeIdentity = {
  packageName: string | null;
  appVersion: string | null;
  buildNumber: string | null;
  installSource: 'GOOGLE_PLAY' | 'SIDELOADED' | 'UNKNOWN' | null;
  installationId: string;
  clientType: 'ANDROID_NATIVE' | 'IOS_NATIVE';
  platform: 'ANDROID' | 'IOS';
};

export type NativeIdentityPayload = {
  packageName: string | null;
  appVersion: string | null;
  buildNumber: string | null;
  installSource: string | null;
};

type BuildInfo = {
  packageName?: string;
  appVersion?: string;
  buildNumber?: string;
  installSource?: string;
  installerPackage?: string;
};

let cachedIdentity: NativeIdentity | null = null;
let inflightIdentity: Promise<NativeIdentity> | null = null;

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 32);
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  }).slice(0, 32);
}

async function getInstallationId(): Promise<string> {
  let id = await AsyncStorage.getItem(INSTALLATION_ID_KEY);
  if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
    id = randomId();
    await AsyncStorage.setItem(INSTALLATION_ID_KEY, id);
  }
  return id;
}

function getNativeBuildInfo(): BuildInfo | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { requireOptionalNativeModule } = require('expo-modules-core') as {
      requireOptionalNativeModule: <T>(name: string) => T | null;
    };
    const mod = requireOptionalNativeModule<{
      getBuildInfo?: () => BuildInfo;
    }>('HigoDevice');
    return mod?.getBuildInfo?.() ?? null;
  } catch {
    return null;
  }
}

function normalizeInstallSource(raw?: string | null): NativeIdentity['installSource'] {
  if (raw === 'GOOGLE_PLAY' || raw === 'SIDELOADED') return raw;
  if (raw === 'UNKNOWN') return 'UNKNOWN';
  return null;
}

function fallbackPackageName(): string | null {
  return (
    Constants.expoConfig?.android?.package ??
    Constants.expoConfig?.ios?.bundleIdentifier ??
    null
  );
}

export async function resolveDeviceIdentity(): Promise<NativeIdentity> {
  if (cachedIdentity) return cachedIdentity;
  if (inflightIdentity) return inflightIdentity;

  inflightIdentity = (async () => {
    const installationId = await getInstallationId();
    const build = getNativeBuildInfo();
    const platform: NativeIdentity['platform'] = Platform.OS === 'ios' ? 'IOS' : 'ANDROID';
    const clientType: NativeIdentity['clientType'] =
      platform === 'IOS' ? 'IOS_NATIVE' : 'ANDROID_NATIVE';

    const identity: NativeIdentity = {
      packageName: build?.packageName || fallbackPackageName(),
      appVersion: build?.appVersion || Constants.expoConfig?.version || null,
      buildNumber: build?.buildNumber || null,
      installSource: normalizeInstallSource(build?.installSource) ?? 'UNKNOWN',
      installationId,
      clientType,
      platform,
    };

    cachedIdentity = identity;
    return identity;
  })();

  try {
    return await inflightIdentity;
  } finally {
    inflightIdentity = null;
  }
}

export function getCachedIdentity(): NativeIdentity | null {
  return cachedIdentity;
}

export function toBridgeIdentity(identity: NativeIdentity): NativeIdentityPayload {
  return {
    packageName: identity.packageName,
    appVersion: identity.appVersion,
    buildNumber: identity.buildNumber,
    installSource: identity.installSource,
  };
}

export function buildClientHeaders(): Record<string, string> {
  const identity = cachedIdentity;
  if (!identity) return {};

  const headers: Record<string, string> = {
    'x-higo-client': identity.clientType,
    'x-higo-platform': identity.platform,
    'x-higo-installation-id': identity.installationId,
  };
  if (identity.appVersion) headers['x-higo-app-version'] = String(identity.appVersion);
  if (identity.buildNumber) headers['x-higo-app-build'] = String(identity.buildNumber);
  if (identity.installSource && identity.installSource !== 'UNKNOWN') {
    headers['x-higo-install-source'] = identity.installSource;
  }
  return headers;
}

export async function requestIntegrityToken(nonce: string): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { requireOptionalNativeModule } = require('expo-modules-core') as {
      requireOptionalNativeModule: <T>(name: string) => T | null;
    };
    const mod = requireOptionalNativeModule<{
      requestIntegrityToken?: (value: string) => Promise<string>;
    }>('HigoDevice');
    if (!mod?.requestIntegrityToken) return null;
    return await mod.requestIntegrityToken(nonce);
  } catch {
    return null;
  }
}
