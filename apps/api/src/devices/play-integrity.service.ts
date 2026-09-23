import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface IntegrityCheckResult {
  verified: boolean;
  reason: string;
  installSource: string;
  installerPackage?: string;
  appVersion?: string;
  buildNumber?: string;
}

@Injectable()
export class PlayIntegrityService {
  private readonly logger = new Logger(PlayIntegrityService.name);

  constructor(private readonly config: ConfigService) {}

  async decode(
    packageName: string,
    nonce: string,
    integrityToken: string,
  ): Promise<IntegrityCheckResult> {
    const apiKey = this.config.get<string>('PLAY_INTEGRITY_API_KEY', '');
    if (!apiKey) {
      return {
        verified: false,
        reason: 'integrity_not_configured',
        installSource: 'UNKNOWN',
      };
    }

    const allowlist = (
      this.config.get<string>(
        'PLAY_INTEGRITY_PACKAGE_ALLOWLIST',
        'com.higopassenger,com.hiconnectgo.driver',
      ) ?? ''
    )
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);

    if (allowlist.length && !allowlist.includes(packageName)) {
      return {
        verified: false,
        reason: 'package_not_allowed',
        installSource: 'UNKNOWN',
      };
    }

    try {
      const url = `https://playintegrity.googleapis.com/v1/${packageName}:decodeIntegrityToken?key=${apiKey}`;
      const response = await axios.post(
        url,
        { integrity_token: integrityToken },
        { timeout: 10_000 },
      );

      const payload = response.data?.tokenPayloadExternal;
      if (!payload) {
        return {
          verified: false,
          reason: 'malformed_payload',
          installSource: 'UNKNOWN',
        };
      }

      const requestDetails = payload.requestDetails ?? {};
      const appIntegrity = payload.appIntegrity ?? {};

      if (
        requestDetails.requestPackageName &&
        requestDetails.requestPackageName !== packageName
      ) {
        return {
          verified: false,
          reason: 'package_mismatch',
          installSource: 'UNKNOWN',
        };
      }

      if (requestDetails.nonce && requestDetails.nonce !== nonce) {
        return {
          verified: false,
          reason: 'nonce_mismatch',
          installSource: 'UNKNOWN',
        };
      }

      const verdict = appIntegrity.appRecognitionVerdict;
      if (verdict === 'PLAY_RECOGNIZED') {
        const versionCode = appIntegrity.versionCode;
        return {
          verified: true,
          reason: 'verified_play_recognized',
          installSource: 'GOOGLE_PLAY',
          installerPackage: 'com.android.vending',
          buildNumber:
            versionCode !== undefined && versionCode !== null
              ? String(versionCode)
              : undefined,
        };
      }

      return {
        verified: false,
        reason: `verdict_${verdict ?? 'unknown'}`,
        installSource: 'UNKNOWN',
      };
    } catch (err) {
      const message = (err as Error).message;
      this.logger.debug(`play integrity decode failed: ${message}`);
      return {
        verified: false,
        reason: 'integrity_api_error',
        installSource: 'UNKNOWN',
      };
    }
  }
}
