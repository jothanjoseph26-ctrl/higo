import { Injectable, Logger } from '@nestjs/common';
import {
  Conversation,
  ConversationType,
  MessageSenderType,
  TripMessage,
} from '@higo/shared-types';
import {
  Conversation as PrismaConversation,
  Message as PrismaMessage,
  MessageSenderType as PrismaMessageSenderType,
  TripStatus as PrismaTripStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/errors/app.exception';
import { AuthUser } from '../common/types/auth-user';
import { EventsGateway } from '../realtime/events.gateway';
import { AiFeaturesService } from '../ai/ai-features.service';

const ACTIVE_TRIP_STATUSES: PrismaTripStatus[] = [
  'matched',
  'en_route',
  'active',
];

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsGateway: EventsGateway,
    private readonly aiFeatures: AiFeaturesService,
  ) {}

  async getTripMessages(tripId: string, user: AuthUser) {
    const trip = await this.assertTripParticipant(tripId, user);
    const conversation = await this.getOrCreateTripConversation(trip);
    const messages = await this.prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });

    return {
      conversation: this.mapConversation(conversation),
      messages: messages.map((message) => this.mapMessage(message)),
    };
  }

  async sendTripMessage(tripId: string, user: AuthUser, body: string) {
    const trip = await this.assertTripParticipant(tripId, user);
    this.assertTripMessagingAllowed(trip.status);

    const senderType = this.resolveSenderType(user);
    const conversation = await this.getOrCreateTripConversation(trip);

    const message = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: user.sub,
        senderType,
        body: body.trim(),
      },
    });

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    const mapped = this.mapMessage(message);
    this.eventsGateway.emitTripMessageNew(tripId, mapped);

    return { message: mapped };
  }

  async getSupportMessages(passengerId: string) {
    const conversation = await this.getOrCreateSupportConversation(passengerId);
    const messages = await this.prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });

    return {
      conversation: this.mapConversation(conversation),
      messages: messages.map((message) => this.mapMessage(message)),
    };
  }

  async sendSupportMessage(passengerId: string, body: string) {
    const conversation = await this.getOrCreateSupportConversation(passengerId);

    const message = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: passengerId,
        senderType: 'passenger',
        body: body.trim(),
      },
    });

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    const mapped = this.mapMessage(message);
    void this.enqueueSupportAiReply(conversation.id, passengerId, body.trim());

    return { message: mapped };
  }

  private async enqueueSupportAiReply(
    conversationId: string,
    passengerId: string,
    userMessage: string,
  ): Promise<void> {
    try {
      const reply = await this.aiFeatures.generateSupportReply(userMessage);
      if (!reply?.trim()) {
        return;
      }

      const aiMessage = await this.prisma.message.create({
        data: {
          conversationId,
          senderId: passengerId,
          senderType: 'admin',
          body: reply.trim(),
        },
      });

      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });

      this.logger.debug(`Support AI reply sent for conversation ${conversationId}: ${aiMessage.id}`);
    } catch (err) {
      this.logger.warn(
        `Support AI reply failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async assertTripParticipant(
    tripId: string,
    user: AuthUser,
  ): Promise<{
    id: string;
    passengerId: string;
    driverId: string | null;
    status: PrismaTripStatus;
  }> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        passengerId: true,
        driverId: true,
        status: true,
      },
    });

    if (!trip) {
      throw new AppException('NOT_FOUND', undefined, 'Trip not found');
    }

    const isPassenger = user.type === 'passenger' && trip.passengerId === user.sub;
    const isDriver = user.type === 'driver' && trip.driverId === user.sub;

    if (!isPassenger && !isDriver) {
      throw new AppException('FORBIDDEN', undefined, 'You are not a participant in this trip');
    }

    return trip;
  }

  private assertTripMessagingAllowed(status: PrismaTripStatus): void {
    if (!ACTIVE_TRIP_STATUSES.includes(status)) {
      throw new AppException(
        'FORBIDDEN',
        undefined,
        'Messaging is only available during matched or active trips',
      );
    }
  }

  private resolveSenderType(user: AuthUser): PrismaMessageSenderType {
    if (user.type === 'passenger') return 'passenger';
    if (user.type === 'driver') return 'driver';
    return 'admin';
  }

  private async getOrCreateTripConversation(trip: {
    id: string;
    passengerId: string;
    driverId: string | null;
  }): Promise<PrismaConversation> {
    const existing = await this.prisma.conversation.findUnique({
      where: { tripId: trip.id },
    });
    if (existing) {
      return existing;
    }

    return this.prisma.conversation.create({
      data: {
        tripId: trip.id,
        passengerId: trip.passengerId,
        driverId: trip.driverId,
        type: 'trip',
      },
    });
  }

  private async getOrCreateSupportConversation(
    passengerId: string,
  ): Promise<PrismaConversation> {
    const existing = await this.prisma.conversation.findFirst({
      where: {
        passengerId,
        type: 'support',
      },
    });
    if (existing) {
      return existing;
    }

    return this.prisma.conversation.create({
      data: {
        passengerId,
        type: 'support',
      },
    });
  }

  private mapConversation(conversation: PrismaConversation): Conversation {
    return {
      id: conversation.id,
      tripId: conversation.tripId,
      passengerId: conversation.passengerId,
      driverId: conversation.driverId,
      type: conversation.type as ConversationType,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
    };
  }

  private mapMessage(message: PrismaMessage): TripMessage {
    return {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      senderType: message.senderType as MessageSenderType,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
    };
  }
}