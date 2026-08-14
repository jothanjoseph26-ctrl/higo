import { Transform } from 'class-transformer';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';

export class NearbyDriversQueryDto {
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;

  @Transform(({ value }) => Number(value))
  @IsNumber()
  @IsOptional()
  @Min(0.5)
  @Max(50)
  radiusKm: number = 5;
}