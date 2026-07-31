import {
  IsNotEmpty,
  IsString,
  IsObject,
  IsEnum,
  IsBoolean,
  IsOptional,
  ValidateNested,
  IsNumber,
  Min,
  Max,
  IsDateString,
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LatLng, VehicleType, PaymentMethod, RideMode } from '@higo/shared-types';

function isFiniteLatLng(value: unknown): value is LatLng {
  if (!value || typeof value !== 'object') return false;

  const point = value as Partial<LatLng>;
  return Number.isFinite(point.lat) && Number.isFinite(point.lng);
}

function IsLatLngObject(validationOptions?: ValidationOptions) {
  return (target: object, propertyName: string) => {
    registerDecorator({
      name: 'isLatLngObject',
      target: target.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return isFiniteLatLng(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must include finite numeric lat and lng`;
        },
      },
    });
  };
}

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
  @IsLatLngObject()
  pickup!: LatLng;

  @IsNotEmpty()
  @IsString()
  pickupAddress!: string;

  @IsNotEmpty()
  @IsObject()
  @IsLatLngObject()
  destination!: LatLng;

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

  @IsOptional()
  @IsEnum(RideMode)
  rideMode?: RideMode;

  @IsOptional()
  @IsDateString()
  scheduledFor?: string;
}

export class QuoteTripDto extends RequestTripDto {}

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
  @IsLatLngObject()
  location!: LatLng;

  @IsOptional()
  @IsString()
  note?: string;
}

export class FindSharedRideDto {
  @IsNotEmpty()
  @IsObject()
  @IsLatLngObject()
  pickup!: LatLng;

  @IsNotEmpty()
  @IsObject()
  @IsLatLngObject()
  destination!: LatLng;

  @IsOptional()
  @IsEnum(VehicleType)
  vehicleType?: VehicleType;
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
