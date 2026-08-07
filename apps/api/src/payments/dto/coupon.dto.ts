import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { SubscriptionTier } from '@higo/shared-types';

export class CreateCouponDto {
  @IsString()
  @Matches(/^[A-Z0-9_-]{3,32}$/, {
    message: 'code must be 3-32 uppercase letters, digits, - or _',
  })
  code!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(SubscriptionTier)
  plan!: SubscriptionTier;

  @IsInt()
  @Min(1)
  durationDays!: number;

  // 0 = unlimited
  @IsOptional()
  @IsInt()
  @Min(0)
  maxUses?: number;

  // 0 = unlimited
  @IsOptional()
  @IsInt()
  @Min(0)
  maxUsesPerUser?: number;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;
}

export class UpdateCouponDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;
}
