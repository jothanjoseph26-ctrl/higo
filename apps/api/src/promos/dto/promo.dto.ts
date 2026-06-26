import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PromoDiscountType } from '@prisma/client';

export class CreatePromoDto {
  @IsNotEmpty()
  @IsString()
  code!: string;

  @IsNotEmpty()
  @IsEnum(PromoDiscountType)
  discountType!: PromoDiscountType;

  @IsNotEmpty()
  @IsInt()
  @Min(1)
  discountValue!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdatePromoDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsEnum(PromoDiscountType)
  discountType?: PromoDiscountType;

  @IsOptional()
  @IsInt()
  @Min(1)
  discountValue?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number | null;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}