import { Type } from 'class-transformer';
import { Max, Min } from 'class-validator';

export class DirectionsQueryDto {
  @Type(() => Number)
  @Min(-90)
  @Max(90)
  originLat!: number;

  @Type(() => Number)
  @Min(-180)
  @Max(180)
  originLng!: number;

  @Type(() => Number)
  @Min(-90)
  @Max(90)
  destLat!: number;

  @Type(() => Number)
  @Min(-180)
  @Max(180)
  destLng!: number;
}