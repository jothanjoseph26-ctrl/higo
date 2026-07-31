import { Controller, Delete } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AppException } from '../common/errors/app.exception';
import { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Delete('me')
  async deleteMine(@CurrentUser() user: AuthUser): Promise<{ deleted: number }> {
    if (user.type === 'admin') {
      throw new AppException('FORBIDDEN', undefined, 'Admins do not have scoped user notifications');
    }

    if (user.type === 'passenger') {
      const result = await this.prisma.notification.deleteMany({
        where: { userId: user.sub, userType: 'passenger' },
      });
      return { deleted: result.count };
    }

    const driver = await this.prisma.driver.findUnique({
      where: { id: user.sub },
      select: { userId: true },
    });
    if (!driver?.userId) return { deleted: 0 };

    const result = await this.prisma.notification.deleteMany({
      where: { userId: driver.userId, userType: 'driver' },
    });
    return { deleted: result.count };
  }
}
