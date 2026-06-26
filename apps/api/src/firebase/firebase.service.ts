import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import {
  App,
  cert,
  getApp,
  getApps,
  initializeApp,
  ServiceAccount,
} from 'firebase-admin/app';
import { Auth, DecodedIdToken, getAuth } from 'firebase-admin/auth';
import { getMessaging, Messaging } from 'firebase-admin/messaging';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private app: App | null = null;
  private enabled = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    if (getApps().length > 0) {
      this.app = getApp();
      this.enabled = true;
      return;
    }

    const credential = this.loadCredential();
    if (!credential) {
      this.logger.warn(
        'Firebase credentials not configured or unreadable; Firebase features disabled',
      );
      this.enabled = false;
      return;
    }

    try {
      this.app = initializeApp({ credential });
      this.enabled = true;
      this.logger.log('Firebase Admin SDK initialized');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Firebase init failed: ${message}; Firebase features disabled`);
      this.enabled = false;
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  get auth(): Auth {
    this.assertEnabled();
    return getAuth(this.app!);
  }

  get messaging(): Messaging {
    this.assertEnabled();
    return getMessaging(this.app!);
  }

  async verifyIdToken(idToken: string): Promise<DecodedIdToken> {
    return this.auth.verifyIdToken(idToken);
  }

  async sendOtpNotification(params: {
    fcmToken: string;
    phone: string;
    code: string;
  }): Promise<string | null> {
    if (!this.enabled) {
      this.logger.debug('Firebase disabled; skipping OTP notification');
      return null;
    }

    const messageId = await this.messaging.send({
      token: params.fcmToken,
      notification: {
        title: 'HiGo Verification Code',
        body: `Your verification code is ${params.code}. Valid for 5 minutes.`,
      },
      data: {
        type: 'otp',
        phone: params.phone,
        code: params.code,
      },
      android: { priority: 'high' },
      apns: {
        headers: { 'apns-priority': '10' },
        payload: { aps: { sound: 'default' } },
      },
    });
    return messageId;
  }

  private assertEnabled(): void {
    if (!this.enabled || !this.app) {
      throw new Error('Firebase is not enabled');
    }
  }

  private loadCredential() {
    const jsonInline = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON');
    if (jsonInline?.trim()) {
      try {
        return cert(JSON.parse(jsonInline) as ServiceAccount);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Invalid FIREBASE_SERVICE_ACCOUNT_JSON: ${message}`);
        return null;
      }
    }

    const keyPath = this.config.get<string>(
      'FIREBASE_SERVICE_ACCOUNT_PATH',
      'hiconnect-firebase-services-key.json',
    );
    const absolutePath = resolve(process.cwd(), keyPath);

    if (!existsSync(absolutePath)) {
      return null;
    }

    try {
      const raw = readFileSync(absolutePath, 'utf8');
      return cert(JSON.parse(raw) as ServiceAccount);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to read Firebase key file at ${absolutePath}: ${message}`);
      return null;
    }
  }
}