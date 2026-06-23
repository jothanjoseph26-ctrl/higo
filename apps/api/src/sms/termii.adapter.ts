import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class TermiiAdapter {
  private readonly logger = new Logger(TermiiAdapter.name);

  constructor(private readonly config: ConfigService) {}

  async sendSms(phone: string, message: string): Promise<void> {
    const baseUrl = this.config.getOrThrow<string>('TERMII_BASE_URL');
    const apiKey = this.config.getOrThrow<string>('TERMII_API_KEY');
    const from = this.config.getOrThrow<string>('TERMII_SENDER_ID');

    await axios.post(
      `${baseUrl}/api/sms/send`,
      {
        api_key: apiKey,
        to: phone,
        from,
        sms: message,
        type: 'plain',
        channel: 'dnd',
      },
      { timeout: 8000 },
    );
    this.logger.debug(`Termii SMS queued for ${phone.slice(0, 6)}***`);
  }
}