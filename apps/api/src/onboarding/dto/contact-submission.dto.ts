import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

const CONTACT_ROLES = ['rider', 'driver', 'partner', 'press', 'other'] as const;

export class CreateContactSubmissionDto {
  @Transform(({ value }) => String(value ?? '').trim())
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @Transform(({ value }) => String(value ?? '').trim().toLowerCase())
  @IsEmail()
  @MaxLength(160)
  email!: string;

  @Transform(({ value }) => {
    const phone = String(value ?? '').trim();
    return phone.length ? phone : undefined;
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsIn(CONTACT_ROLES)
  role!: (typeof CONTACT_ROLES)[number];

  @Transform(({ value }) => String(value ?? '').trim())
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  message!: string;
}
