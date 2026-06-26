import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { FirebaseService } from './firebase.service';

@Injectable()
export class FirebaseOtpAdapter {
  private readonly logger = new Logger(FirebaseOtpAdapter.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async sendOtp(phone: string, code: string): Promise<'firebase' | 'firebase-dev'> {
    const fcmToken = await this.lookupFcmToken(phone);

    if (fcmToken && this.firebase.isEnabled()) {
      await this.firebase.sendOtpNotification({ fcmToken, phone, code });
      return 'firebase';
    }

    const isDev = this.config.get<string>('NODE_ENV', 'development') !== 'production';
    this.logger.warn(
      `No FCM token for ${phone}. ${
        isDev
          ? `OTP (dev only): ${code}`
          : 'User must complete Firebase Phone Auth on client.'
      }`,
    );
    return 'firebase-dev';
  }

  private async lookupFcmToken(phone: string): Promise<string | null> {
    const [user, driver] = await Promise.all([
      this.prisma.user.findUnique({
        where: { phone },
        select: { fcmToken: true },
      }),
      this.prisma.driver.findUnique({
        where: { phone },
        select: { fcmToken: true },
      }),
    ]);
    return user?.fcmToken ?? driver?.fcmToken ?? null;
  }
}