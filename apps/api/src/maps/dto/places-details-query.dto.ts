import { IsString, MaxLength, MinLength } from 'class-validator';

export class PlacesDetailsQueryDto {
  @IsString()
  @MinLength(10)
  @MaxLength(300)
  placeId!: string;
}