import { Type } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';

export class DirectionsQueryDto {
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  originLat!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  originLng!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  destLat!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  destLng!: number;
}