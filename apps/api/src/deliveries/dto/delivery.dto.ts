import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';
import { LatLng, PaymentMethod } from '@higo/shared-types';

export enum ParcelSizeDto {
  SMALL = 'small',
  MEDIUM = 'medium',
  LARGE = 'large',
}

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

export class RequestDeliveryDto {
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
  dropoff!: LatLng;

  @IsNotEmpty()
  @IsString()
  dropoffAddress!: string;

  @IsNotEmpty()
  @IsString()
  recipientName!: string;

  @IsNotEmpty()
  @IsString()
  recipientPhone!: string;

  @IsOptional()
  @IsEnum(ParcelSizeDto)
  parcelSize?: ParcelSizeDto;

  @IsOptional()
  @IsString()
  parcelDescription?: string;

  @IsOptional()
  @IsString()
  parcelPhotoUrl?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  description?: string;
}

export class CancelDeliveryDto {
  @IsNotEmpty()
  @IsString()
  reason!: string;
}

export class CompleteDeliveryDto {
  @IsOptional()
  @IsString()
  deliveryPhotoUrl?: string;

  @IsOptional()
  @IsBoolean()
  recipientVerified?: boolean;
}

export class UpdateDeliveryTrackingDto {
  @IsNotEmpty()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;
}
