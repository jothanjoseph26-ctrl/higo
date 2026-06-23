import { Injectable, Logger } from '@nestjs/common';
import { AfricasTalkingAdapter } from './africastalking.adapter';
import { TermiiAdapter } from './termii.adapter';

export type SmsChannel = 'termii' | 'africastalking' | 'mock';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(
    private readonly termii: TermiiAdapter,
    private readonly africasTalking: AfricasTalkingAdapter,
  ) {}

  async sendOtp(
    phone: string,
    code: string,
  ): Promise<{ channel: SmsChannel }> {
    const message = `Your HiGo verification code is ${code}. Valid for 5 minutes.`;
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