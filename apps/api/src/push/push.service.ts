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

  async sendToToken(token: string, payload: PushNotificationPayload): Promise<void> {
    if (!this.enabled) {
      this.logger.debug(`Push disabled; skipping "${payload.title}"`);
      return;
    }

    try {
      await this.firebase.messaging.send({
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
      this.logger.debug(`Push sent: "${payload.title}"`);
    } catch (err: unknown) {
      if (this.isInvalidTokenError(err)) {
        this.logger.warn(
          `Invalid or expired FCM token (${this.tokenErrorCode(err)}); notification skipped`,
        );
        return;
      }

      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`FCM send failed: ${message}`);
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
      this.logger.debug(`No FCM token for passenger ${passengerId}`);
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
      this.logger.debug(`No FCM token for driver ${driverId}`);
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