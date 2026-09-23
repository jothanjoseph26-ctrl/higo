import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationState } from './whatsapp.types';

@Injectable()
export class SessionCleanupJob {
  private readonly logger = new Logger(SessionCleanupJob.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async cleanupStaleSessions(): Promise<void> {
    const staleConversations = await this.prisma.whatsAppConversation.findMany({
      where: {
        isActive: true,
        sessionExpiresAt: { lt: new Date() },
        conversationState: {
          notIn: [
            ConversationState.IDLE,
            ConversationState.HUMAN_HANDOFF,
          ],
        },
      },
    });

    if (staleConversations.length === 0) return;

    this.logger.log(`Cleaning up ${staleConversations.length} stale WhatsApp sessions`);

    for (const conv of staleConversations) {
      await this.prisma.whatsAppConversation.update({
        where: { id: conv.id },
        data: {
          conversationState: ConversationState.IDLE,
          activeBooking: null,
          sessionExpiresAt: null,
        },
      });
    }
  }
}
