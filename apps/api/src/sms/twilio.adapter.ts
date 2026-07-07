import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class TwilioAdapter {
  private readonly logger = new Logger(TwilioAdapter.name);

  constructor(private readonly config: ConfigService) {}

  hasVerifyService(): boolean {
    return Boolean(
      this.config.get<string>('TWILIO_VERIFY_SERVICE_SID', '').trim(),
    );
  }

  async startVerification(phone: string): Promise<void> {
    const accountSid = this.config.getOrThrow<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.getAuthCredential();
    const serviceSid = this.config
      .getOrThrow<string>('TWILIO_VERIFY_SERVICE_SID')
      .trim();
    const to = this.normalizePhone(phone);

    if (!serviceSid) {
      throw new Error('TWILIO_VERIFY_SERVICE_SID is empty');
    }

    try {
      await axios.post(
        `https://verify.twilio.com/v2/Services/${serviceSid}/Verifications`,
        new URLSearchParams({
          To: to,
          Channel: 'sms',
        }),
        {
          auth: { username: accountSid, password: authToken },
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 10000,
        },
      );
      this.logger.debug(`Twilio Verify OTP queued for ${to.slice(0, 6)}***`);
    } catch (error) {
      const detail = this.describeAxiosError(error);
      this.logger.error(
        `Twilio Verify send failed for ${to.slice(0, 6)}***: ${detail}`,
      );
      throw new Error(`Twilio Verify send failed: ${detail}`);
    }
  }

  async checkVerification(phone: string, code: string): Promise<boolean> {
    const accountSid = this.config.getOrThrow<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.getAuthCredential();
    const serviceSid = this.config
      .getOrThrow<string>('TWILIO_VERIFY_SERVICE_SID')
      .trim();
    const to = this.normalizePhone(phone);

    if (!serviceSid) {
      throw new Error('TWILIO_VERIFY_SERVICE_SID is empty');
    }

    try {
      const response = await axios.post<{ status?: string }>(
        `https://verify.twilio.com/v2/Services/${serviceSid}/VerificationCheck`,
        new URLSearchParams({
          To: to,
          Code: code,
        }),
        {
          auth: { username: accountSid, password: authToken },
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 10000,
        },
      );
      return response.data.status === 'approved';
    } catch (error) {
      const detail = this.describeAxiosError(error);
      this.logger.error(
        `Twilio Verify check failed for ${to.slice(0, 6)}***: ${detail}`,
      );
      throw new Error(`Twilio Verify check failed: ${detail}`);
    }
  }

  async sendSms(phone: string, message: string): Promise<void> {
    const accountSid = this.config.getOrThrow<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.getAuthCredential();
    const fromNumber = this.config.get<string>('TWILIO_PHONE_NUMBER', '').trim();
    const messagingServiceSid = this.config
      .get<string>('TWILIO_MESSAGING_SERVICE_SID', '')
      .trim();

    if (!fromNumber && !messagingServiceSid) {
      throw new Error(
        'TWILIO_PHONE_NUMBER or TWILIO_MESSAGING_SERVICE_SID must be set',
      );
    }

    const to = this.normalizePhone(phone);
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
        this.describeAxiosError(error);
      this.logger.error(`Twilio SMS failed for ${to.slice(0, 6)}***: ${detail}`);
      throw new Error(`Twilio SMS failed: ${detail}`);
    }
  }

  private normalizePhone(phone: string): string {
    return phone.startsWith('+') ? phone : `+${phone.replace(/\D/g, '')}`;
  }

  private getAuthCredential(): string {
    const credential =
      this.config.get<string>('TWILIO_AUTH_TOKEN', '').trim() ||
      this.config.get<string>('TWILIO_API_KEY', '').trim();

    if (!credential) {
      throw new Error('TWILIO_AUTH_TOKEN or TWILIO_API_KEY must be set');
    }

    return credential;
  }

  private describeAxiosError(error: unknown): string {
    return axios.isAxiosError(error) && error.response?.data
      ? JSON.stringify(error.response.data)
      : error instanceof Error
        ? error.message
        : 'unknown';
  }
}
