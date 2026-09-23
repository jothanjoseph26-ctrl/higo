import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';

export type FunnelEvent =
  | 'session_started'
  | 'registration_started'
  | 'registration_completed'
  | 'booking_started'
  | 'pickup_received'
  | 'destination_received'
  | 'fare_generated'
  | 'vehicle_selected'
  | 'booking_confirmed'
  | 'driver_search_started'
  | 'driver_matched'
  | 'payment_started'
  | 'payment_completed'
  | 'trip_started'
  | 'trip_completed'
  | 'trip_cancelled'
  | 'rating_submitted';

@Injectable()
export class WhatsAppAnalytics {
  private readonly logger = new Logger(WhatsAppAnalytics.name);

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  async track(
    event: FunnelEvent,
    conversationId: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const hour = now.toISOString().slice(0, 13);

    await this.redis.incr(`wa:analytics:${date}:${event}`);
    await this.redis.incr(`wa:analytics:${hour}:${event}`);
    await this.redis.raw.sadd(`wa:analytics:${date}:${event}:conversations`, conversationId);
    await this.redis.expire(`wa:analytics:${date}:${event}:conversations`, 30 * 24 * 60 * 60);

    const logEntry = JSON.stringify({
      event,
      conversationId,
      timestamp: now.toISOString(),
      metadata,
    });
    await this.redis.raw.lpush('wa:analytics:log', logEntry);
    await this.redis.raw.ltrim('wa:analytics:log', 0, 999);
  }

  async getDailyStats(date: string): Promise<Record<string, { count: number; unique: number }>> {
    const events: FunnelEvent[] = [
      'session_started', 'booking_started', 'pickup_received',
      'destination_received', 'fare_generated', 'vehicle_selected',
      'booking_confirmed', 'driver_search_started', 'driver_matched',
      'trip_started', 'trip_completed', 'trip_cancelled', 'rating_submitted',
    ];

    const stats: Record<string, { count: number; unique: number }> = {};

    for (const event of events) {
      const countStr = await this.redis.get(`wa:analytics:${date}:${event}`);
      const count = countStr ? parseInt(countStr, 10) : 0;
      const unique = await this.redis.raw.scard(`wa:analytics:${date}:${event}:conversations`);
      stats[event] = { count, unique };
    }

    return stats;
  }

  async getConversionRate(date: string): Promise<{
    sessionToBooking: number;
    bookingToMatch: number;
    matchToComplete: number;
    overallConversion: number;
  }> {
    const stats = await this.getDailyStats(date);

    const sessionStarted = stats.session_started?.unique || 1;
    const bookingConfirmed = stats.booking_confirmed?.unique || 0;
    const driverMatched = stats.driver_matched?.unique || 0;
    const tripCompleted = stats.trip_completed?.unique || 0;

    return {
      sessionToBooking: Math.round((bookingConfirmed / sessionStarted) * 100),
      bookingToMatch: Math.round((driverMatched / bookingConfirmed) * 100) || 0,
      matchToComplete: Math.round((tripCompleted / driverMatched) * 100) || 0,
      overallConversion: Math.round((tripCompleted / sessionStarted) * 100),
    };
  }

  @Cron(CronExpression.EVERY_HOUR)
  async flushToDatabase(): Promise<void> {
    try {
      const date = new Date().toISOString().slice(0, 10);
      const stats = await this.getDailyStats(date);

      await this.prisma.$executeRaw`
        INSERT INTO whatsapp_analytics (id, date, stats, created_at)
        VALUES (${crypto.randomUUID()}, ${date}::date, ${JSON.stringify(stats)}::jsonb, NOW())
        ON CONFLICT (date) DO UPDATE SET stats = ${JSON.stringify(stats)}::jsonb, updated_at = NOW()
      `;
    } catch (error) {
      this.logger.error(`Failed to flush analytics: ${error.message}`);
    }
  }
}
