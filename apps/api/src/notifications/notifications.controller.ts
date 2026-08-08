import { Controller, Delete, Get, Patch, Post, Param, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AppException } from '../common/errors/app.exception';
import { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveUserId(user: AuthUser): Promise<string | null> {
    if (user.type === 'passenger') return user.sub;
    if (user.type === 'driver') {
      const driver = await this.prisma.driver.findUnique({
        where: { id: user.sub },
        select: { userId: true },
      });
      return driver?.userId ?? null;
    }
    return null;
  }

  @Get('me')
  async listMine(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    if (user.type === 'admin') {
      throw new AppException('FORBIDDEN', undefined, 'Admins do not have scoped user notifications');
    }

    const userId = await this.resolveUserId(user);
    if (!userId) return { items: [], total: 0 };

    const take = Math.min(limit ?? 20, 50);
    const skip = offset ?? 0;
    const where: Record<string, unknown> = { userId };
    if (unreadOnly === 'true') where.isRead = false;

    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return { items, total, limit: take, offset: skip };
  }

  @Post('me/read')
  async markAllRead(@CurrentUser() user: AuthUser): Promise<{ updated: number }> {
    if (user.type === 'admin') {
      throw new AppException('FORBIDDEN', undefined, 'Admins do not have scoped user notifications');
    }

    const userId = await this.resolveUserId(user);
    if (!userId) return { updated: 0 };

    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    return { updated: result.count };
  }

  @Patch(':id/read')
  async markRead(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    if (user.type === 'admin') {
      throw new AppException('FORBIDDEN', undefined, 'Admins do not have scoped user notifications');
    }

    const userId = await this.resolveUserId(user);
    if (!userId) throw new AppException('NOT_FOUND', undefined, 'User not found');

    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification || notification.userId !== userId) {
      throw new AppException('NOT_FOUND', undefined, 'Notification not found');
    }

    await this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });

    return { success: true };
  }

  @Delete('me')
  async deleteMine(@CurrentUser() user: AuthUser): Promise<{ deleted: number }> {
    if (user.type === 'admin') {
      throw new AppException('FORBIDDEN', undefined, 'Admins do not have scoped user notifications');
    }

    const userId = await this.resolveUserId(user);
    if (!userId) return { deleted: 0 };

    const result = await this.prisma.notification.deleteMany({
      where: { userId },
    });
    return { deleted: result.count };
  }
}
