import { Controller, Get, Query } from '@nestjs/common';
import type {
  GetDirectionsResponse,
  PlaceDetailsResponse,
  PlacesAutocompleteResponse,
} from '@higo/shared-types';
import { RateLimit } from '../common/guards/rate-limit.guard';
import { AppException } from '../common/errors/app.exception';
import { MapsService } from './maps.service';
import { DirectionsQueryDto } from './dto/directions-query.dto';
import { PlacesAutocompleteQueryDto } from './dto/places-autocomplete-query.dto';
import { PlacesDetailsQueryDto } from './dto/places-details-query.dto';

@Controller('maps')
export class MapsController {
  constructor(private readonly mapsService: MapsService) {}

  @Get('directions')
  @RateLimit({
    scope: 'maps-directions',
    limit: 60,
    windowSeconds: 60,
    keyFrom: 'user',
  })
  async getDirections(
    @Query() query: DirectionsQueryDto,
  ): Promise<GetDirectionsResponse> {
    return this.mapsService.getDirections(
      { lat: query.originLat, lng: query.originLng },
      { lat: query.destLat, lng: query.destLng },
    );
  }

  @Get('places/autocomplete')
  @RateLimit({
    scope: 'maps-places-autocomplete',
    limit: 60,
    windowSeconds: 60,
    keyFrom: 'user',
  })
  async placesAutocomplete(
    @Query() query: PlacesAutocompleteQueryDto,
  ): Promise<PlacesAutocompleteResponse> {
    return this.mapsService.placesAutocomplete(query.input);
  }

  @Get('places/details')
  @RateLimit({
    scope: 'maps-places-details',
    limit: 60,
    windowSeconds: 60,
    keyFrom: 'user',
  })
  async placesDetails(
    @Query() query: PlacesDetailsQueryDto,
  ): Promise<PlaceDetailsResponse> {
    const details = await this.mapsService.placesDetails(query.placeId);
    if (!details) {
      throw new AppException('NOT_FOUND', undefined, 'Place not found');
    }
    return details;
  }
}