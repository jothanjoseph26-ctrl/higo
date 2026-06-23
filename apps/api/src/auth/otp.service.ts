import { Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import { RedisService } from '../redis/redis.service';
import { AppException } from '../common/errors/app.exception';

const OTP_TTL_SECONDS = 300;
const OTP_ATTEMPTS_TTL_SECONDS = 3600;
const MAX_VERIFY_ATTEMPTS = 5;

@Injectable()
export class OtpService {
  constructor(private readonly redis: RedisService) {}

  generateCode(): string {
    return String(randomInt(100000, 999999));
  }

  async storeOtp(phone: string, code: string): Promise<void> {
    await this.redis.set(`otp:${phone}`, code, OTP_TTL_SECONDS);
  }

  async verifyOtp(phone: string, code: string): Promise<void> {
    const attemptsKey = `otp:attempts:${phone}`;
    const attempts = Number((await this.redis.get(attemptsKey)) ?? '0');
    if (attempts >= MAX_VERIFY_ATTEMPTS) {
      throw new AppException('RATE_LIMITED');
    }

    const stored = await this.redis.get(`otp:${phone}`);
    if (!stored) {
      throw new AppException('OTP_EXPIRED');
    }
    if (stored !== code) {
      const next = await this.redis.incr(attemptsKey);
      if (next === 1) {
        await this.redis.expire(attemptsKey, OTP_ATTEMPTS_TTL_SECONDS);
      }
      throw new AppException('OTP_INVALID');
    }

    await this.redis.del(`otp:${phone}`);
    await this.redis.del(attemptsKey);
  }
}