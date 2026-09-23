import {
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class SubmitIntegrityDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{8,64}$/)
  installationId!: string;

  @IsString()
  @Matches(/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/)
  packageName!: string;

  @IsString()
  @Length(8, 128)
  nonce!: string;

  @IsString()
  @Length(1, 8192)
  integrityToken!: string;
}

export class ListInstallationsQueryDto {
  @IsOptional()
  @IsIn(['passenger', 'driver', 'admin'])
  role?: 'passenger' | 'driver' | 'admin';

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{8,64}$/)
  installationId?: string;
}
