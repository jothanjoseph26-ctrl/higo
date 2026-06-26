import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../email/email.service';
import { RedisService } from '../redis/redis.service';
import { WeeklyKpiService } from './weekly-kpi.service';

@Injectable()
export class WeeklyKpiSummaryJob {
  private readonly logger = new Logger(WeeklyKpiSummaryJob.name);

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly weeklyKpi: WeeklyKpiService,
    private readonly email: EmailService,
  ) {}

  @Cron('0 20 * * 5', { timeZone: 'Africa/Lagos' })
  async handleCron(): Promise<void> {
    if (!this.isEnabled()) return;

    const lockKey = 'cron:weekly-kpi-summary';
    const acquired = await this.redis.setNx(lockKey, '1', 7200);
    if (!acquired) {
      this.logger.debug('Weekly KPI email skipped — lock held');
      return;
    }

    try {
      const { from, to } = this.weeklyKpi.getCurrentWeekRange();
      const kpi = await this.weeklyKpi.computeForPeriod(from, to);
      const recipients = this.resolveRecipients();

      if (recipients.length === 0) {
        this.logger.warn('WEEKLY_KPI_EMAIL_RECIPIENTS not set; skipping KPI email');
        return;
      }

      const sent = await this.email.sendWeeklyKpiSummary({
        to: recipients,
        kpi,
        plainText: this.weeklyKpi.formatPlainEnglishSummary(kpi),
      });

      if (sent) {
        this.logger.log(`Weekly KPI summary emailed to ${recipients.join(', ')}`);
      }
    } catch (error) {
      this.logger.error(
        `Weekly KPI summary failed: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    } finally {
      await this.redis.del(lockKey);
    }
  }

  private resolveRecipients(): string[] {
    const raw = this.config.get<string>('WEEKLY_KPI_EMAIL_RECIPIENTS', '');
    return raw
      .split(',')
      .map((email) => email.trim())
      .filter(Boolean);
  }

  private isEnabled(): boolean {
    return this.config.get<boolean>('CRON_JOBS_ENABLED', true);
  }
}