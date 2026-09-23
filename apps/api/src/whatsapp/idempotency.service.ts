import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const ACTION_LOCK_TTL = 30; // 30 seconds

@Injectable()
export class IdempotencyService {
  constructor(private readonly redis: RedisService) {}

  /**
   * Check if a WhatsApp message has already been processed.
   * Returns true if this is a duplicate.
   */
  async isDuplicateMessage(whatsappMessageId: string): Promise<boolean> {
    const key = `wa:idempotent:${whatsappMessageId}`;
    const isNew = await this.redis.setNx(key, '1', DEFAULT_TTL_SECONDS);
    return !isNew; // setNx returns true if key was NEW (not duplicate)
  }

  /**
   * Acquire a distributed lock for an action (e.g., ride creation, payment init).
   * Returns true if lock was acquired.
   */
  async acquireActionLock(actionKey: string, ttlSeconds: number = ACTION_LOCK_TTL): Promise<boolean> {
    const key = `wa:lock:${actionKey}`;
    return this.redis.setNx(key, '1', ttlSeconds);
  }

  /**
   * Release a distributed lock early.
   */
  async releaseActionLock(actionKey: string): Promise<void> {
    const key = `wa:lock:${actionKey}`;
    await this.redis.del(key);
  }

  /**
   * Generate an idempotency key for ride creation.
   * Ties to conversation + timestamp window to prevent double-booking.
   */
  rideCreationKey(conversationId: string): string {
    // Use 5-minute window so rapid taps don't create duplicates
    const window = Math.floor(Date.now() / (5 * 60 * 1000));
    return `ride:${conversationId}:${window}`;
  }

  /**
   * Generate an idempotency key for payment initialization.
   * Ties to trip + amount to prevent duplicate payment links.
   */
  paymentInitKey(tripId: string, amountKobo: number): string {
    return `payment:${tripId}:${amountKobo}`;
  }
}
