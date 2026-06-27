import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class TwilioAdapter {
  private readonly logger = new Logger(TwilioAdapter.name);

  constructor(private readonly config: ConfigService) {}

  async sendSms(phone: string, message: string): Promise<void> {
    const accountSid = this.config.getOrThrow<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.getOrThrow<string>('TWILIO_AUTH_TOKEN');
    const fromNumber = this.config.get<string>('TWILIO_PHONE_NUMBER', '').trim();
    const messagingServiceSid = this.config
      .get<string>('TWILIO_MESSAGING_SERVICE_SID', '')
      .trim();

    if (!fromNumber && !messagingServiceSid) {
      throw new Error(
        'TWILIO_PHONE_NUMBER or TWILIO_MESSAGING_SERVICE_SID must be set',
      );
    }

    const to = phone.startsWith('+') ? phone : `+${phone.replace(/\D/g, '')}`;
    const body = new URLSearchParams({
      To: to,
      Body: message,
    });

    if (messagingServiceSid) {
      body.set('MessagingServiceSid', messagingServiceSid);
    } else {
      body.set('From', fromNumber);
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

    try {
      await axios.post(url, body, {
        auth: { username: accountSid, password: authToken },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000,
      });
      this.logger.debug(`Twilio SMS queued for ${to.slice(0, 6)}***`);
    } catch (error) {
      const detail =
        axios.isAxiosError(error) && error.response?.data
          ? JSON.stringify(error.response.data)
          : error instanceof Error
            ? error.message
            : 'unknown';
      this.logger.error(`Twilio SMS failed for ${to.slice(0, 6)}***: ${detail}`);
      throw new Error(`Twilio SMS failed: ${detail}`);
    }
  }
}