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

/** Which physical ID a driver submitted for the NIN/identity document slot. */
export enum IdentityDocSubtype {
  NIN_SLIP = 'nin_slip',
  INTL_PASSPORT = 'intl_passport',
  DRIVERS_LICENCE = 'drivers_licence',
  VOTERS_CARD = 'voters_card',
}

export class UploadKycDto {
  @IsEnum(KycDocType)
  docType!: KycDocType;

  // Only meaningful when docType === NIN - VerifyMe/NIMC live verification
  // isn't integrated yet, so identity is proven via document upload instead,
  // accepting whichever of these forms of ID the driver actually has.
  @IsOptional()
  @IsEnum(IdentityDocSubtype)
  identityDocType?: IdentityDocSubtype;
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