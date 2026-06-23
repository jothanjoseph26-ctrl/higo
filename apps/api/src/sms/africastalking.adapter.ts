import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class AfricasTalkingAdapter {
  private readonly logger = new Logger(AfricasTalkingAdapter.name);

  constructor(private readonly config: ConfigService) {}

  async sendSms(phone: string, message: string): Promise<void> {
    const username = this.config.getOrThrow<string>('AFRICASTALKING_USERNAME');
    const apiKey = this.config.getOrThrow<string>('AFRICASTALKING_API_KEY');
    const from = this.config.getOrThrow<string>('AFRICASTALKING_SENDER_ID');

    const body = new URLSearchParams({
      username,
      to: phone,
      message,
      from,
    });

    await axios.post('https://api.africastalking.com/version1/messaging', body, {
      headers: {
        apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      timeout: 8000,
    });
    this.logger.debug(`AfricasTalking SMS queued for ${phone.slice(0, 6)}***`);
  }
}