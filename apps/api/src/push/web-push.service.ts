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

  private maskEndpoint(endpoint: string): string {
    return endpoint.length > 20 ? `${endpoint.slice(0, 20)}***` : '***';
  }

  async sendToDriver(driverId: string, payload: WebPushPayload): Promise<boolean> {
    const event = payload.data?.type || 'unknown';
    if (!this.isEnabled()) {
      this.logger.log(`NOTIFICATION ATTEMPT userId=${driverId} role=driver event=${event} channel=WebPush dest=none provider=web-push success=false error=vapid_disabled`);
      return false;
    }

    const raw = await this.redis.get(`push:driver:${driverId}`);
    if (!raw) {
      this.logger.log(`NOTIFICATION ATTEMPT userId=${driverId} role=driver event=${event} channel=WebPush dest=none provider=web-push success=false error=no_subscription`);
      return false;
    }

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
      this.logger.log(`NOTIFICATION ATTEMPT userId=${driverId} role=driver event=${event} channel=WebPush dest=${this.maskEndpoint(subscription.endpoint)} provider=web-push success=true`);
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // 404/410 = subscription expired, remove it
      if (message.includes('404') || message.includes('410') || message.includes('expired')) {
        await this.redis.del(`push:driver:${driverId}`);
        this.logger.log(`NOTIFICATION ATTEMPT userId=${driverId} role=driver event=${event} channel=WebPush dest=${this.maskEndpoint(subscription.endpoint)} provider=web-push success=false error=expired_removed`);
      } else {
        this.logger.warn(`NOTIFICATION ATTEMPT userId=${driverId} role=driver event=${event} channel=WebPush dest=${this.maskEndpoint(subscription.endpoint)} provider=web-push success=false error=${message}`);
      }
      return false;
    }
  }
}
