import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { IsString, IsOptional, IsEnum } from 'class-validator';
import { SupportTicketCategory } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user';
import { AppException } from '../common/errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';

export class CreateSupportTicketDto {
  @IsEnum(SupportTicketCategory)
  category!: SupportTicketCategory;

  @IsString()
  description!: string;

  @IsOptional()
  @IsString()
  tripId?: string;
}

@Controller('support')
export class SupportController {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveUserId(user: AuthUser): Promise<string> {
    if (user.type === 'passenger') return user.sub;
    if (user.type === 'driver') {
      const driver = await this.prisma.driver.findUnique({
        where: { id: user.sub },
        select: { userId: true },
      });
      if (!driver?.userId) throw new AppException('NOT_FOUND', undefined, 'Driver user record not found');
      return driver.userId;
    }
    throw new AppException('FORBIDDEN', undefined, 'Only passengers and drivers can create support tickets');
  }

  @Post('tickets')
  async createTicket(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateSupportTicketDto,
  ) {
    const userId = await this.resolveUserId(user);

    const ticket = await this.prisma.supportTicket.create({
      data: {
        raisedByUserId: userId,
        raisedByType: user.type === 'driver' ? 'driver' : 'passenger',
        category: dto.category,
        description: dto.description,
        tripId: dto.tripId ?? null,
      },
    });

    return { ticketId: ticket.id, status: ticket.status };
  }

  @Get('tickets')
  async listMyTickets(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit: number = 10,
    @Query('offset') offset: number = 0,
  ) {
    const userId = await this.resolveUserId(user);

    const [tickets, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where: { raisedByUserId: userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.supportTicket.count({ where: { raisedByUserId: userId } }),
    ]);

    return { tickets, total, limit, offset };
  }

  @Get('tickets/:id')
  async getTicket(
    @CurrentUser() user: AuthUser,
    @Param('id') ticketId: string,
  ) {
    const userId = await this.resolveUserId(user);

    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket || ticket.raisedByUserId !== userId) {
      throw new AppException('NOT_FOUND', undefined, 'Support ticket not found');
    }

    return ticket;
  }
}
