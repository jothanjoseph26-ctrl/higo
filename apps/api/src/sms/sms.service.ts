import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AfricasTalkingAdapter } from './africastalking.adapter';
import { TermiiAdapter } from './termii.adapter';
import { FirebaseOtpAdapter } from '../firebase/firebase-otp.adapter';

export type SmsChannel =
  | 'firebase'
  | 'firebase-dev'
  | 'termii'
  | 'africastalking'
  | 'mock';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly firebaseOtp: FirebaseOtpAdapter,
    private readonly termii: TermiiAdapter,
    private readonly africasTalking: AfricasTalkingAdapter,
  ) {}

  async sendOtp(
    phone: string,
    code: string,
  ): Promise<{ channel: SmsChannel }> {
    const message = `Your HiGo verification code is ${code}. Valid for 5 minutes.`;
    const provider = this.config.get<string>('OTP_PROVIDER', 'firebase');

    if (provider === 'firebase') {
      const channel = await this.firebaseOtp.sendOtp(phone, code);
      if (channel === 'firebase-dev') {
        this.logger.warn(
          `No FCM token for ${phone}; falling back to SMS gateway for OTP delivery`,
        );
        return this.sendSms(phone, message);
      }
      return { channel };
    }

    return this.sendSms(phone, message);
  }

  async sendSms(
    phone: string,
    message: string,
  ): Promise<{ channel: SmsChannel }> {
    try {
      await this.termii.sendSms(phone, message);
      return { channel: 'termii' };
    } catch (error) {
      this.logger.warn(
        `Termii failed, falling back to AfricasTalking: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
      try {
        await this.africasTalking.sendSms(phone, message);
        return { channel: 'africastalking' };
      } catch (atError) {
        this.logger.error(
          `AfricasTalking also failed: ${
            atError instanceof Error ? atError.message : 'unknown'
          }`,
        );
        this.logger.log(
          `[DEVELOPMENT MOCK SMS] To: ${phone} | Message: ${message}`,
        );
        return { channel: 'mock' };
      }
    }
  }
}