import { requireOptionalNativeModule } from 'expo-modules-core';

export type HigoBuildInfo = {
  packageName: string;
  appVersion: string;
  buildNumber: string;
  installSource: 'GOOGLE_PLAY' | 'SIDELOADED' | 'UNKNOWN' | string;
  installerPackage: string;
};

export type HigoDeviceModuleType = {
  getBuildInfo(): HigoBuildInfo;
  requestIntegrityToken(nonce: string): Promise<string>;
};

const higoDevice = requireOptionalNativeModule<HigoDeviceModuleType>('HigoDevice');

export function getBuildInfo(): HigoBuildInfo | null {
  try {
    return higoDevice?.getBuildInfo() ?? null;
  } catch {
    return null;
  }
}

export async function requestIntegrityToken(nonce: string): Promise<string | null> {
  if (!higoDevice?.requestIntegrityToken) return null;
  return higoDevice.requestIntegrityToken(nonce);
}

export default higoDevice;
