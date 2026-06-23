import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  KycDocType,
  KycRejectionCode,
  ReviewKycRequest,
} from '@higo/shared-types';

export class UploadKycDto {
  @IsEnum(KycDocType)
  docType!: KycDocType;
}

export class ReviewKycDocumentDto {
  @IsEnum(KycDocType)
  docType!: KycDocType;

  @IsIn(['approve', 'reject'])
  decision!: 'approve' | 'reject';

  @ValidateIf((o: ReviewKycDocumentDto) => o.decision === 'reject')
  @IsEnum(KycRejectionCode)
  rejectionCode?: KycRejectionCode;

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

export class ReviewKycDto implements ReviewKycRequest {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReviewKycDocumentDto)
  documents!: ReviewKycDocumentDto[];
}

export class SetOperatingZonesDto {
  @IsArray()
  @IsUUID('4', { each: true })
  zoneIds!: string[];
}