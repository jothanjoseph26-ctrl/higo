import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { VehicleType } from '@higo/shared-types';

const LANGUAGES = ['en', 'pcm', 'ha', 'yo', 'ig'] as const;

export class CreateDriverApplicationDto {
  @Transform(({ value }) => String(value ?? '').trim())
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName!: string;

  @Transform(({ value }) => String(value ?? '').trim())
  @IsString()
  @Matches(/^\+?[0-9\s()-]{7,20}$/)
  phone!: string;

  @Transform(({ value }) => {
    const email = String(value ?? '').trim().toLowerCase();
    return email.length ? email : undefined;
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @Transform(({ value }) => String(value ?? 'Abuja').trim())
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  city!: string;

  @IsIn(LANGUAGES)
  preferredLanguage!: (typeof LANGUAGES)[number];

  @IsEnum(VehicleType)
  vehicleType!: VehicleType;

  @Transform(({ value }) => {
    const plate = String(value ?? '').trim().toUpperCase();
    return plate.length ? plate : undefined;
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  vehiclePlate?: string;

  @Transform(({ value }) => {
    const model = String(value ?? '').trim();
    return model.length ? model : undefined;
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  vehicleModel?: string;

  @IsBoolean()
  hasSmartphone!: boolean;

  @IsBoolean()
  hasNin!: boolean;

  @IsBoolean()
  hasDriversLicence!: boolean;

  @IsBoolean()
  consentAccepted!: boolean;
}
