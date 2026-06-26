import { IsString, MaxLength, MinLength } from 'class-validator';

export class PlacesAutocompleteQueryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  input!: string;
}