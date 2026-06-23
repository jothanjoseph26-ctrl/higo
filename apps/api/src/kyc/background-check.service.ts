import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

/**
 * Phase 1 STUB — replace handleWebhook body with a real provider in Phase 2.
 * Signatures are stable so the swap is drop-in.
 */
@Injectable()
export class BackgroundCheckService {
  private readonly logger = new Logger(BackgroundCheckService.name);

  async initiate(
    driverId: string,
  ): Promise<{ checkId: string; status: 'pending' }> {
    const checkId = `mock-${randomUUID()}`;
    this.logger.debug(`Background check stub initiated driver=${driverId}`);
    return { checkId, status: 'pending' };
  }

  async handleWebhook(
    payload: unknown,
  ): Promise<{ driverId: string; result: 'clear' | 'flagged' | 'pending' }> {
    const body = payload as { driverId?: string } | null;
    return {
      driverId: body?.driverId ?? 'unknown',
      result: 'clear',
    };
  }
}