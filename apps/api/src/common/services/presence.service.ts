import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

const BUMP_THROTTLE_SECONDS = 300;

@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async bump(
    userType: 'passenger' | 'driver',
    userId: string,
    opts?: { force?: boolean },
  ): Promise<void> {
    try {
      if (!opts?.force) {
        const key = `presence:bump:${userType}:${userId}`;
        const acquired = await this.redis.setNx(key, '1', BUMP_THROTTLE_SECONDS);
        if (!acquired) return;
      }
      const now = new Date();
      if (userType === 'passenger') {
        await this.prisma.user.update({
          where: { id: userId },
          data: { lastSeenAt: now },
        });
      } else {
        await this.prisma.driver.update({
          where: { id: userId },
          data: { lastSeenAt: now },
        });
      }
    } catch (err) {
      this.logger.debug(
        `lastSeenAt bump failed type=${userType} id=${userId}: ${(err as Error).message}`,
      );
    }
  }
}
