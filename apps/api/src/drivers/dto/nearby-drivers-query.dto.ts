import { Type } from 'class-transformer';
import { IsOptional, Max, Min } from 'class-validator';

export class NearbyDriversQueryDto {
  @Type(() => Number)
  @Min(-90)
  @Max(90)
  lat!: number;

  @Type(() => Number)
  @Min(-180)
  @Max(180)
  lng!: number;

  @Type(() => Number)
  @IsOptional()
  @Min(0.5)
  @Max(50)
  radiusKm: number = 5;
}