import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor(config: ConfigService) {
    this.client = new Redis(config.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: 3,
    });
  }

  get raw(): Redis {
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
      return;
    }
    await this.client.set(key, value);
  }

  async setNx(
    key: string,
    value: string,
    ttlSeconds?: number,
  ): Promise<boolean> {
    if (ttlSeconds) {
      const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    }
    const result = await this.client.setnx(key, value);
    return result === 1;
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.client.expire(key, ttlSeconds);
  }

  /** Sliding-window rate limit using a sorted set. */
  async slidingWindow(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<boolean> {
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;
    const member = `${now}`;

    const pipeline = this.client.pipeline();
    pipeline.zremrangebyscore(key, 0, windowStart);
    pipeline.zadd(key, now, member);
    pipeline.zcard(key);
    pipeline.expire(key, windowSeconds);
    const results = await pipeline.exec();
    const count = (results?.[2]?.[1] as number) ?? 0;
    return count <= limit;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}