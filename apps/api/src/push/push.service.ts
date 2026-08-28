import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FirebaseService } from '../firebase/firebase.service';
import { PrismaService } from '../prisma/prisma.service';

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private enabled = false;

  constructor(
    private readonly firebase: FirebaseService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const firebaseOk = this.firebase.isEnabled();
    const raw = process.env.PUSH_ENABLED;
    const pushRequested =
      raw === undefined || raw === ''
        ? firebaseOk
        : raw === 'true' || raw === '1';

    this.enabled = pushRequested && firebaseOk;

    if (!firebaseOk) {
      this.logger.warn('Push notifications disabled (Firebase not configured)');
    } else if (!this.enabled) {
      this.logger.log('Push notifications disabled via PUSH_ENABLED');
    } else {
      this.logger.log('Push notifications enabled');
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private maskToken(token: string): string {
    if (token.length <= 10) return '***';
    return `${token.slice(0, 6)}***${token.slice(-4)}`;
  }

  async sendToToken(token: string, payload: PushNotificationPayload): Promise<void> {
    const masked = this.maskToken(token);
    const event = payload.data?.type || 'unknown';
    if (!this.enabled) {
      this.logger.log(`NOTIFICATION ATTEMPT role=unknown event=${event} channel=FCM dest=${masked} provider=FCM success=false error=disabled`);
      return;
    }

    try {
      const messageId = await this.firebase.messaging.send({
        token,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data ?? {},
        android: { priority: 'high' },
        apns: {
          headers: { 'apns-priority': '10' },
          payload: { aps: { sound: 'default' } },
        },
      });
      this.logger.log(`NOTIFICATION ATTEMPT event=${event} channel=FCM dest=${masked} provider=FCM success=true response=${messageId} title="${payload.title}"`);
    } catch (err: unknown) {
      if (this.isInvalidTokenError(err)) {
        this.logger.warn(
          `NOTIFICATION ATTEMPT event=${event} channel=FCM dest=${masked} provider=FCM success=false error=${this.tokenErrorCode(err)}`,
        );
        return;
      }

      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`NOTIFICATION ATTEMPT event=${event} channel=FCM dest=${masked} provider=FCM success=false error=${message}`);
    }
  }

  async sendToPassenger(
    passengerId: string,
    payload: PushNotificationPayload,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: passengerId },
      select: { fcmToken: true },
    });

    if (!user?.fcmToken) {
      this.logger.log(`NOTIFICATION ATTEMPT userId=${passengerId} role=passenger event=${payload.data?.type || 'unknown'} channel=FCM dest=none provider=FCM success=false error=no_token title="${payload.title}"`);
      return;
    }

    await this.sendToToken(user.fcmToken, payload);
  }

  async sendToDriver(driverId: string, payload: PushNotificationPayload): Promise<void> {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      select: { fcmToken: true },
    });

    if (!driver?.fcmToken) {
      this.logger.log(`NOTIFICATION ATTEMPT userId=${driverId} role=driver event=${payload.data?.type || 'unknown'} channel=FCM dest=none provider=FCM success=false error=no_token title="${payload.title}"`);
      return;
    }

    await this.sendToToken(driver.fcmToken, payload);
  }

  private isInvalidTokenError(err: unknown): boolean {
    const code = this.tokenErrorCode(err);
    return (
      code === 'messaging/invalid-registration-token' ||
      code === 'messaging/registration-token-not-registered'
    );
  }

  private tokenErrorCode(err: unknown): string | undefined {
    if (typeof err === 'object' && err !== null && 'code' in err) {
      return String((err as { code: unknown }).code);
    }
    return undefined;
  }
}