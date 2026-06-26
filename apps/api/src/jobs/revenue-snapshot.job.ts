import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { RevenueSnapshotService } from './revenue-snapshot.service';

@Injectable()
export class RevenueSnapshotJob {
  private readonly logger = new Logger(RevenueSnapshotJob.name);

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly revenueSnapshot: RevenueSnapshotService,
  ) {}

  @Cron('30 0 * * *', { timeZone: 'Africa/Lagos' })
  async handleCron(): Promise<void> {
    if (!this.isEnabled()) return;

    const lockKey = 'cron:revenue-snapshot';
    const acquired = await this.redis.setNx(lockKey, '1', 3600);
    if (!acquired) {
      this.logger.debug('Revenue snapshot skipped — lock held');
      return;
    }

    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      await this.revenueSnapshot.snapshotDay(yesterday);
    } catch (error) {
      this.logger.error(
        `Revenue snapshot failed: ${
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