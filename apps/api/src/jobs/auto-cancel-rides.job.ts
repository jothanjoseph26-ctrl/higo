import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { AutoCancelRidesService } from './auto-cancel-rides.service';

@Injectable()
export class AutoCancelRidesJob {
  private readonly logger = new Logger(AutoCancelRidesJob.name);

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly autoCancelRides: AutoCancelRidesService,
  ) {}

  @Cron('*/1 * * * *', { timeZone: 'Africa/Lagos' })
  async handleCron(): Promise<void> {
    if (!this.isEnabled()) return;

    const lockKey = 'cron:auto-cancel-rides';
    const acquired = await this.redis.setNx(lockKey, '1', 120);
    if (!acquired) {
      this.logger.debug('Auto-cancel rides skipped - lock held');
      return;
    }

    try {
      const result = await this.autoCancelRides.cancelStuckTrips();
      if (result.cancelled > 0) {
        this.logger.warn(`Auto-cancelled ${result.cancelled} stuck trip(s)`);
      }
    } catch (error) {
      this.logger.error(
        `Auto-cancel rides failed: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    } finally {
      await this.redis.del(lockKey);
    }
  }

  private isEnabled(): boolean {
    return this.config.get<boolean>('CRON_JOBS_ENABLED', true);
  }
}
