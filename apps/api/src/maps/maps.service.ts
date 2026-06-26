import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import type {
  GetDirectionsResponse,
  LatLng,
  PlaceDetailsResponse,
  PlacesAutocompleteResponse,
} from '@higo/shared-types';
import { RedisService } from '../redis/redis.service';

const DIRECTIONS_CACHE_TTL_SECONDS = 300;
const COORD_PRECISION = 4;

@Injectable()
export class MapsService {
  private readonly logger = new Logger(MapsService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  async placesAutocomplete(input: string): Promise<PlacesAutocompleteResponse> {
    const apiKey = this.config.get<string>('GOOGLE_MAPS_API_KEY');
    if (!apiKey) {
      this.logger.warn('GOOGLE_MAPS_API_KEY not set; returning empty autocomplete');
      return { suggestions: [] };
    }

    try {
      const response = await axios.get(
        'https://maps.googleapis.com/maps/api/place/autocomplete/json',
        {
          params: {
            input,
            key: apiKey,
            components: 'country:ng',
            language: 'en',
          },
          timeout: 10_000,
        },
      );

      const data = response.data as {
        status?: string;
        predictions?: Array<{
          place_id?: string;
          description?: string;
        }>;
      };

      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        this.logger.warn(
          `Places autocomplete returned status=${data.status ?? 'unknown'}`,
        );
        return { suggestions: [] };
      }

      const suggestions = (data.predictions ?? [])
        .filter((prediction) => prediction.place_id && prediction.description)
        .map((prediction) => ({
          placeId: prediction.place_id as string,
          description: prediction.description as string,
        }));

      return { suggestions };
    } catch (error) {
      this.logger.warn(
        `Places autocomplete request failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return { suggestions: [] };
    }
  }

  async placesDetails(placeId: string): Promise<PlaceDetailsResponse | null> {
    const apiKey = this.config.get<string>('GOOGLE_MAPS_API_KEY');
    if (!apiKey) {
      this.logger.warn('GOOGLE_MAPS_API_KEY not set; cannot resolve place details');
      return null;
    }

    try {
      const response = await axios.get(
        'https://maps.googleapis.com/maps/api/place/details/json',
        {
          params: {
            place_id: placeId,
            fields: 'geometry,formatted_address,name',
            key: apiKey,
            language: 'en',
          },
          timeout: 10_000,
        },
      );

      const data = response.data as {
        status?: string;
        result?: {
          formatted_address?: string;
          name?: string;
          geometry?: {
            location?: { lat?: number; lng?: number };
          };
        };
      };

      if (data.status !== 'OK' || !data.result?.geometry?.location) {
        this.logger.warn(
          `Places details returned status=${data.status ?? 'unknown'} for placeId=${placeId}`,
        );
        return null;
      }

      const location = data.result.geometry.location;
      const description =
        data.result.formatted_address ?? data.result.name ?? 'Selected location';

      return {
        placeId,
        description,
        lat: location.lat as number,
        lng: location.lng as number,
      };
    } catch (error) {
      this.logger.warn(
        `Places details request failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return null;
    }
  }

  async getDirections(
    origin: LatLng,
    destination: LatLng,
  ): Promise<GetDirectionsResponse> {
    const cacheKey = this.buildCacheKey(origin, destination);
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as GetDirectionsResponse;
    }

    const enabled = this.config.get<boolean>('MAPS_DIRECTIONS_ENABLED', true);
    const apiKey = this.config.get<string>('GOOGLE_MAPS_API_KEY');

    if (!enabled || !apiKey) {
      const fallback = this.buildStraightLineFallback(origin, destination);
      await this.redis.set(
        cacheKey,
        JSON.stringify(fallback),
        DIRECTIONS_CACHE_TTL_SECONDS,
      );
      return fallback;
    }

    try {
      const response = await axios.get(
        'https://maps.googleapis.com/maps/api/directions/json',
        {
          params: {
            origin: `${origin.lat},${origin.lng}`,
            destination: `${destination.lat},${destination.lng}`,
            key: apiKey,
          },
          timeout: 10_000,
        },
      );

      const data = response.data as {
        status?: string;
        routes?: Array<{
          overview_polyline?: { points?: string };
          legs?: Array<{
            distance?: { value?: number };
            duration?: { value?: number };
          }>;
        }>;
      };

      const route = data.routes?.[0];
      const encoded = route?.overview_polyline?.points;
      const leg = route?.legs?.[0];

      if (data.status !== 'OK' || !encoded || !leg) {
        this.logger.warn(
          `Directions API returned status=${data.status ?? 'unknown'}; using straight-line fallback`,
        );
        const fallback = this.buildStraightLineFallback(origin, destination);
        await this.redis.set(
          cacheKey,
          JSON.stringify(fallback),
          DIRECTIONS_CACHE_TTL_SECONDS,
        );
        return fallback;
      }

      const result: GetDirectionsResponse = {
        polyline: decodePolyline(encoded),
        distanceMeters: leg.distance?.value ?? 0,
        durationSeconds: leg.duration?.value ?? 0,
      };

      await this.redis.set(
        cacheKey,
        JSON.stringify(result),
        DIRECTIONS_CACHE_TTL_SECONDS,
      );
      return result;
    } catch (error) {
      this.logger.warn(
        `Directions API request failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      const fallback = this.buildStraightLineFallback(origin, destination);
      await this.redis.set(
        cacheKey,
        JSON.stringify(fallback),
        DIRECTIONS_CACHE_TTL_SECONDS,
      );
      return fallback;
    }
  }

  private buildCacheKey(origin: LatLng, destination: LatLng): string {
    const oLat = roundCoord(origin.lat);
    const oLng = roundCoord(origin.lng);
    const dLat = roundCoord(destination.lat);
    const dLng = roundCoord(destination.lng);
    return `maps:directions:${oLat},${oLng}:${dLat},${dLng}`;
  }

  private buildStraightLineFallback(
    origin: LatLng,
    destination: LatLng,
  ): GetDirectionsResponse {
    const distanceMeters = haversineMeters(origin, destination);
    const urbanSpeedMps = 8.33;

    return {
      polyline: [origin, destination],
      distanceMeters: Math.round(distanceMeters),
      durationSeconds: Math.max(60, Math.round(distanceMeters / urbanSpeedMps)),
    };
  }
}

function roundCoord(value: number): number {
  const factor = 10 ** COORD_PRECISION;
  return Math.round(value * factor) / factor;
}

function haversineMeters(a: LatLng, b: LatLng): number {
  const earthRadiusMeters = 6_371_000;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;

  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(h));
}

/** Google encoded polyline algorithm (inline, no extra dependency). */
function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
}