import {
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import {
  GoogleAuthRequest,
  LogoutRequest,
  RefreshTokenRequest,
  SendOtpRequest,
  VerifyOtpRequest,
} from '@higo/shared-types';

export class SendOtpDto implements SendOtpRequest {
  @Matches(/^\+[1-9]\d{7,14}$/)
  phone!: string;

  @IsIn(['passenger', 'driver'])
  userType!: 'passenger' | 'driver';
}

export class VerifyOtpDto implements VerifyOtpRequest {
  @Matches(/^\+[1-9]\d{7,14}$/)
  phone!: string;

  @IsString()
  @Length(6, 6)
  code!: string;

  @IsIn(['passenger', 'driver'])
  userType!: 'passenger' | 'driver';
}

export class GoogleAuthDto implements GoogleAuthRequest {
  @IsString()
  idToken!: string;

  @IsIn(['passenger', 'driver'])
  userType!: 'passenger' | 'driver';
}

export class RefreshTokenDto implements RefreshTokenRequest {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class LogoutDto implements LogoutRequest {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}