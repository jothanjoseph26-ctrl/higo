import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { KycDocType, KycRejectionCode } from '@higo/shared-types';

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

export interface ReviewKycDocumentItem {
  docType: KycDocType;
  decision: 'approve' | 'reject';
  rejectionCode?: KycRejectionCode;
  rejectionReason?: string;
}

export class ReviewKycDto {
  // Deliberately not @ValidateNested()/@Type(ReviewKycDocumentDto) here - that
  // combination reproducibly triggered NestJS's whitelist stripping to reject
  // docType/decision as "should not exist" on every single call in this
  // deployment (100% failure rate, confirmed against live logs), for reasons
  // that didn't resolve with straightforward fixes. KYCService.review()
  // validates each item's shape itself instead.
  @IsArray()
  @ArrayMinSize(1)
  documents!: ReviewKycDocumentItem[];
}

export class SetOperatingZonesDto {
  @IsArray()
  @IsUUID('4', { each: true })
  zoneIds!: string[];
}