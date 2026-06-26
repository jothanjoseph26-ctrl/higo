import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AppException } from '../common/errors/app.exception';
import { RateLimit, RateLimitGuard } from '../common/guards/rate-limit.guard';
import { AuthUser } from '../common/types/auth-user';
import { SendMessageDto } from './dto/message.dto';
import { MessagesService } from './messages.service';

@Controller()
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('trips/:tripId/messages')
  async getTripMessages(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
  ) {
    return this.messagesService.getTripMessages(tripId, user);
  }

  @Post('trips/:tripId/messages')
  @UseGuards(RateLimitGuard)
  @RateLimit({
    scope: 'trip-message',
    limit: 10,
    windowSeconds: 60,
    keyFrom: 'user',
  })
  async sendTripMessage(
    @CurrentUser() user: AuthUser,
    @Param('tripId') tripId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messagesService.sendTripMessage(tripId, user, dto.body);
  }

  @Get('passengers/me/support/messages')
  async getSupportMessages(@CurrentUser() user: AuthUser) {
    this.assertPassenger(user);
    return this.messagesService.getSupportMessages(user.sub);
  }

  @Post('passengers/me/support/messages')
  @UseGuards(RateLimitGuard)
  @RateLimit({
    scope: 'support-message',
    limit: 10,
    windowSeconds: 60,
    keyFrom: 'user',
  })
  async sendSupportMessage(
    @CurrentUser() user: AuthUser,
    @Body() dto: SendMessageDto,
  ) {
    this.assertPassenger(user);
    return this.messagesService.sendSupportMessage(user.sub, dto.body);
  }

  private assertPassenger(user: AuthUser): void {
    if (user.type !== 'passenger') {
      throw new AppException('FORBIDDEN', undefined, 'Only passengers can use support messaging');
    }
  }
}