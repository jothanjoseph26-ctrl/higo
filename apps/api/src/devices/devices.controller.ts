import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { RateLimit, RateLimitGuard } from '../common/guards/rate-limit.guard';
import { AuthUser } from '../common/types/auth-user';
import { ClientInstallationService } from './client-installation.service';
import { PlayIntegrityService } from './play-integrity.service';
import {
  ListInstallationsQueryDto,
  SubmitIntegrityDto,
} from './dto/devices.dto';

@Controller('devices')
export class DevicesController {
  constructor(
    private readonly installations: ClientInstallationService,
    private readonly playIntegrity: PlayIntegrityService,
  ) {}

  @Get('installations')
  async listMine(@CurrentUser() user: AuthUser) {
    return this.installations.listMine(user);
  }

  @Get('installations/:userId')
  @UseGuards(RolesGuard)
  @Roles('admin', 'super_admin')
  async listForUser(
    @Param('userId') userId: string,
    @Query() query: ListInstallationsQueryDto,
  ) {
    return this.installations.listForUser(userId, query);
  }

  @Post('integrity')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @RateLimit({
    scope: 'integrity',
    limit: 30,
    windowSeconds: 3600,
    keyFrom: 'user',
  })
  async submitIntegrity(
    @CurrentUser() user: AuthUser,
    @Body() dto: SubmitIntegrityDto,
  ) {
    const result = await this.playIntegrity.decode(
      dto.packageName,
      dto.nonce,
      dto.integrityToken,
    );

    await this.installations.submitIntegrityResult(user, dto.installationId, {
      verified: result.verified,
      installSource: result.installSource,
      installerPackage: result.installerPackage,
      reason: result.reason,
      appVersion: result.appVersion,
      buildNumber: result.buildNumber,
      clientType: result.verified ? 'ANDROID_NATIVE' : undefined,
      devicePlatform: result.verified ? 'ANDROID' : undefined,
    });

    return {
      verified: result.verified,
      reason: result.reason,
      installSource: result.installSource,
    };
  }
}
