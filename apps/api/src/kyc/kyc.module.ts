import { Module } from '@nestjs/common';
import { KycController } from './kyc.controller';
import { KYCService } from './kyc.service';
import { OcrService } from './ocr.service';
import { ComplianceService } from './compliance.service';
import { BackgroundCheckService } from './background-check.service';
import { UserTypeGuard } from '../common/guards/user-type.guard';

@Module({
  controllers: [KycController],
  providers: [
    KYCService,
    OcrService,
    ComplianceService,
    BackgroundCheckService,
    UserTypeGuard,
  ],
  exports: [KYCService, ComplianceService, BackgroundCheckService],
})
export class KycModule {}