import { IsNotEmpty, IsString, IsObject, IsEnum, IsBoolean, IsOptional, ValidateNested, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { LatLng, VehicleType, PaymentMethod } from '@higo/shared-types';

export class LatLngDto implements LatLng {
  @IsNotEmpty()
  @IsNumber()
  lat!: number;

  @IsNotEmpty()
  @IsNumber()
  lng!: number;
}

export class RequestTripDto {
  @IsNotEmpty()
  @IsObject()
  @ValidateNested()
  @Type(() => LatLngDto)
  pickup!: LatLngDto;

  @IsNotEmpty()
  @IsString()
  pickupAddress!: string;

  @IsNotEmpty()
  @IsObject()
  @ValidateNested()
  @Type(() => LatLngDto)
  destination!: LatLngDto;

  @IsNotEmpty()
  @IsString()
  destinationAddress!: string;

  @IsNotEmpty()
  @IsEnum(VehicleType)
  vehicleType!: VehicleType;

  @IsNotEmpty()
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsOptional()
  @IsBoolean()
  isShared?: boolean;

  @IsOptional()
  @IsString()
  promoCode?: string;
}

export class CancelTripDto {
  @IsNotEmpty()
  @IsString()
  reason!: string;
}

export class RateDriverDto {
  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  comment?: string;
}

export class RatePassengerDto {
  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  comment?: string;
}

export class TripSosDto {
  @IsNotEmpty()
  @IsObject()
  @ValidateNested()
  @Type(() => LatLngDto)
  location!: LatLngDto;

  @IsOptional()
  @IsString()
  note?: string;
}

export class PostDriverLocationDto {
  @IsNotEmpty()
  @IsNumber()
  lat!: number;

  @IsNotEmpty()
  @IsNumber()
  lng!: number;

  @IsOptional()
  @IsNumber()
  bearing?: number;

  @IsOptional()
  @IsNumber()
  speed?: number;

  @IsOptional()
  @IsNumber()
  accuracy?: number;
}
