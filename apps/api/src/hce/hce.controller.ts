import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user';
import { HceService } from './hce.service';
import { HceSettingsService } from './hce-settings.service';
import { HceUsageService } from './hce-usage.service';

@Controller('hce')
export class HceController {
  constructor(
    private readonly hce: HceService,
    private readonly settings: HceSettingsService,
    private readonly usage: HceUsageService,
  ) {}

  @Post('translate')
  translate(
    @CurrentUser() user: AuthUser,
    @Body() dto: { text: string; targetLanguage: string; sourceLanguage?: string },
  ) {
    return this.hce.translate(user, dto);
  }

  @Post('transcribe')
  transcribe(
    @CurrentUser() user: AuthUser,
    @Body() dto: { transcript?: string; languageHint?: string },
  ) {
    return this.hce.transcribe(user, dto);
  }

  @Post('speak')
  speak(
    @CurrentUser() user: AuthUser,
    @Body() dto: { text: string; language: string; voiceGender?: 'male' | 'female' },
  ) {
    return this.hce.speak(user, dto);
  }

  @Post('voice-note')
  voiceNote(
    @CurrentUser() user: AuthUser,
    @Body() dto: { text?: string; transcript?: string; targetLanguage: string; sourceLanguage?: string },
  ) {
    return this.hce.voiceNote(user, dto);
  }

  @Post('intent')
  intent(
    @CurrentUser() user: AuthUser,
    @Body() dto: { text?: string; transcript?: string; context?: string },
  ) {
    return this.hce.intent(user, dto);
  }

  @Post('voice-booking')
  voiceBooking(
    @CurrentUser() user: AuthUser,
    @Body() dto: { transcript?: string; text?: string },
  ) {
    return this.hce.voiceBooking(user, dto);
  }

  @Post('landmarks/resolve')
  resolveLandmark(
    @CurrentUser() user: AuthUser,
    @Body() dto: { description: string; zone?: string },
  ) {
    return this.hce.resolveLandmark(user, dto);
  }

  @Post('driver-assistant')
  assistant(
    @CurrentUser() user: AuthUser,
    @Body() dto: { question?: string; transcript?: string },
  ) {
    return this.hce.assistant(user, dto);
  }

  @Get('language-preference')
  getLanguagePreference(@CurrentUser() user: AuthUser) {
    return this.hce.getLanguagePreference(user);
  }

  @Put('language-preference')
  updateLanguagePreference(
    @CurrentUser() user: AuthUser,
    @Body() dto: { languageCode: string; voiceGender?: 'male' | 'female'; autoReadoutEnabled?: boolean },
  ) {
    return this.hce.updateLanguagePreference(user, dto);
  }

  @Get('phrases/:language')
  phrases(@Param('language') language: string) {
    return this.hce.phrases(language);
  }

  @Get('voice-pack/:language/:key')
  voicePack(@Param('language') language: string, @Param('key') key: string) {
    return this.hce.voicePack(language, key);
  }

  @Get('status')
  async status() {
    return {
      config: await this.settings.getConfig(),
      usage: await this.usage.getCounters(),
    };
  }
}
