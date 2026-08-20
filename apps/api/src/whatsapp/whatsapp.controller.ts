import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';

@Controller('api/whatsapp')
export class WhatsAppController {
  constructor(private readonly whatsappService: WhatsAppService) {}

  @Get('webhook')
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    return this.whatsappService.verifyWebhook(mode, token, challenge);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  receiveMessage(@Body() body: Record<string, unknown>) {
    return this.whatsappService.handleIncomingMessage(body);
  }

  @Get('health')
  healthCheck() {
    return this.whatsappService.getHealth();
  }

  @Get('conversations')
  listConversations(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.whatsappService.listConversations({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      status,
    });
  }

  @Get('conversations/:id')
  getConversation(@Param('id') id: string) {
    return this.whatsappService.getConversation(id);
  }

  @Patch('conversations/:id')
  updateConversation(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.whatsappService.updateConversation(id, body);
  }

  @Post('send')
  @HttpCode(HttpStatus.CREATED)
  sendMessage(@Body() body: { to: string; message: string; templateName?: string }) {
    return this.whatsappService.sendMessage(body);
  }

  @Get('config')
  getConfig() {
    return this.whatsappService.getConfig();
  }

  @Patch('config')
  updateConfig(@Body() body: Record<string, unknown>) {
    return this.whatsappService.updateConfig(body);
  }

  @Get('stats')
  getStats(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.whatsappService.getStats({ from, to });
  }

  @Get('errors')
  getErrors(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.whatsappService.getErrorStats({
      from,
      to,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  @Post('circuit-reset/:service')
  @HttpCode(HttpStatus.OK)
  resetCircuitBreaker(@Param('service') service: string) {
    return this.whatsappService.resetCircuitBreaker(service);
  }
}
