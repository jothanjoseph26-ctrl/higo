import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RedisService } from '../../redis/redis.service';
import { AppException } from '../errors/app.exception';
import { AuthUser } from '../types/auth-user';

export const RATE_LIMIT_KEY = 'rateLimit';
export interface RateLimitOptions {
  limit: number;
  windowSeconds: number;
  scope: string;
  keyFrom?: 'user' | 'ip' | 'phone';
}

export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: AuthUser;
      ip?: string;
      body?: { phone?: string };
      route?: { path?: string };
    }>();

    if (request.route?.path?.startsWith('/health')) {
      return true;
    }

    const options =
      this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ??
      ({
        scope: 'default',
        limit: 100,
        windowSeconds: 60,
        keyFrom: request.user?.sub ? 'user' : 'ip',
      } as RateLimitOptions);

    const key = this.resolveKey(request, options);
    const redisKey = `ratelimit:${options.scope}:${key}`;
    const allowed = await this.redis.slidingWindow(
      redisKey,
      options.limit,
      options.windowSeconds,
    );
    if (!allowed) {
      throw new AppException('RATE_LIMITED');
    }
    return true;
  }

  private resolveKey(
    request: { user?: AuthUser; ip?: string; body?: { phone?: string } },
    options: RateLimitOptions,
  ): string {
    if (options.keyFrom === 'phone' && request.body?.phone) {
      return request.body.phone;
    }
    if (options.keyFrom === 'user' && request.user?.sub) {
      return request.user.sub;
    }
    return request.ip ?? 'unknown';
  }
}