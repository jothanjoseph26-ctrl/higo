import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequireUserTypes, UserTypeGuard } from '../common/guards/user-type.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user';
import { KYCService } from './kyc.service';
import { ComplianceService } from './compliance.service';
import {
  ReviewKycDto,
  SetOperatingZonesDto,
  UploadKycDto,
} from './dto/kyc.dto';

@Controller('kyc')
@UseGuards(AuthGuard, UserTypeGuard, RolesGuard)
export class KycController {
  constructor(
    private readonly kyc: KYCService,
    private readonly compliance: ComplianceService,
  ) {}

  @RequireUserTypes('driver')
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @CurrentUser() user: AuthUser,
    @Body() dto: UploadKycDto,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string; originalname: string },
  ) {
    if (!file) {
      throw new BadRequestException('file is required');
    }
    return this.kyc.uploadDocument(user.sub, dto.docType, {
      buffer: file.buffer,
      mimetype: file.mimetype,
      originalname: file.originalname,
    });
  }

  @RequireUserTypes('driver')
  @Get('status')
  status(@CurrentUser() user: AuthUser) {
    return this.kyc.getStatus(user.sub);
  }

  @RequireUserTypes('admin')
  @Roles('admin', 'super_admin')
  @Get(':driverId/documents')
  documents(
    @Param('driverId') driverId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.kyc.getDocumentUrls(driverId, user.sub);
  }

  @RequireUserTypes('admin')
  @Roles('admin', 'super_admin')
  @Put(':driverId/review')
  review(
    @Param('driverId') driverId: string,
    @Body() dto: ReviewKycDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.kyc.review(driverId, dto, user.sub);
  }

  @RequireUserTypes('admin')
  @Roles('admin', 'super_admin')
  @Put(':driverId/operating-zones')
  operatingZones(
    @Param('driverId') driverId: string,
    @Body() dto: SetOperatingZonesDto,
  ) {
    return this.compliance.setOperatingZones(driverId, dto.zoneIds);
  }
}