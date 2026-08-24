import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
  registeredAt?: string;
}

interface WebPushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

@Injectable()
export class WebPushService {
  private readonly logger = new Logger(WebPushService.name);
  private vapidPublicKey: string;
  private vapidPrivateKey: string;
  private vapidSubject: string;

  constructor(private readonly redis: RedisService) {
    this.vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
    this.vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
    this.vapidSubject = process.env.VAPID_SUBJECT || 'mailto:support@hiconnectgo.com';

    if (!this.vapidPublicKey || !this.vapidPrivateKey) {
      this.logger.warn('VAPID keys not configured; web push disabled');
    }
  }

  isEnabled(): boolean {
    return !!(this.vapidPublicKey && this.vapidPrivateKey);
  }

  async sendToDriver(driverId: string, payload: WebPushPayload): Promise<boolean> {
    if (!this.isEnabled()) return false;

    const raw = await this.redis.get(`push:driver:${driverId}`);
    if (!raw) return false;

    let subscription: PushSubscription;
    try {
      subscription = JSON.parse(raw);
    } catch {
      return false;
    }

    try {
      const { default: webpush } = await import('web-push');
      webpush.setVapidDetails(
        this.vapidSubject,
        this.vapidPublicKey,
        this.vapidPrivateKey,
      );

      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: subscription.keys,
        },
        JSON.stringify({
          title: payload.title,
          body: payload.body,
          data: payload.data || {},
        }),
      );
      this.logger.debug(`Web push sent to driver ${driverId}`);
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // 404/410 = subscription expired, remove it
      if (message.includes('404') || message.includes('410') || message.includes('expired')) {
        await this.redis.del(`push:driver:${driverId}`);
        this.logger.debug(`Removed expired push subscription for driver ${driverId}`);
      } else {
        this.logger.warn(`Web push failed for driver ${driverId}: ${message}`);
      }
      return false;
    }
  }
}
