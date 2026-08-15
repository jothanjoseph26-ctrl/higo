import { Type } from 'class-transformer';
import { Max, Min } from 'class-validator';

export class ReverseGeocodeQueryDto {
  @Type(() => Number)
  @Min(-90)
  @Max(90)
  lat!: number;

  @Type(() => Number)
  @Min(-180)
  @Max(180)
  lng!: number;
}
