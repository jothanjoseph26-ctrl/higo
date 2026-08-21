import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class TermiiAdapter {
  private readonly logger = new Logger(TermiiAdapter.name);

  constructor(private readonly config: ConfigService) {}

  async sendSms(phone: string, message: string): Promise<void> {
    const baseUrl = this.config.getOrThrow<string>('TERMII_BASE_URL').replace(/\/$/, '');
    const apiKey = this.config.getOrThrow<string>('TERMII_API_KEY').trim();
    const from = this.config.getOrThrow<string>('TERMII_SENDER_ID').trim();

    if (!apiKey) {
      throw new Error('TERMII_API_KEY is empty');
    }

    const maxRetries = 2;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.post(
          `${baseUrl}/api/sms/send`,
          {
            api_key: apiKey,
            to: phone,
            from,
            sms: message,
            type: 'plain',
            channel: 'dnd',
          },
          { timeout: 10000 },
        );

        const data = response.data as Record<string, unknown>;
        this.logger.log(
          `Termii SMS sent to ${phone.slice(0, 6)}*** (attempt ${attempt}) — status: ${data?.status ?? 'unknown'}, balance: ${data?.balance ?? 'n/a'}`,
        );
        return;
      } catch (error) {
        lastError = error;
        const detail =
          axios.isAxiosError(error) && error.response?.data
            ? JSON.stringify(error.response.data)
            : error instanceof Error
              ? error.message
              : 'unknown';
        this.logger.warn(
          `Termii SMS failed for ${phone.slice(0, 6)}*** (attempt ${attempt}/${maxRetries}): ${detail}`,
        );
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(`Termii SMS failed after ${maxRetries} attempts`);
  }
}