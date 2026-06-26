import { Injectable } from '@nestjs/common';
import {
  EmergencyContact,
  PaginatedResponse,
  PaginationQuery,
  SavedPlace,
  SavedPlaceLabel,
  SetEmergencyContactsRequest,
  SetSavedPlacesRequest,
  Trip,
  UpdateMyProfileRequest,
  User,
} from '@higo/shared-types';
import { mapUser } from '../auth/auth.mappers';
import { AppException } from '../common/errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { TripService } from '../trips/trips.service';

@Injectable()
export class PassengersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tripService: TripService,
  ) {}

  async getMe(passengerId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: passengerId } });
    if (!user) {
      throw new AppException('NOT_FOUND', undefined, 'Passenger profile not found');
    }
    return mapUser(user);
  }

  async updateMe(passengerId: string, dto: UpdateMyProfileRequest): Promise<User> {
    const user = await this.prisma.user.update({
      where: { id: passengerId },
      data: {
        name: dto.name,
        email: dto.email,
        avatarUrl: dto.avatarUrl,
        preferredLanguage: dto.preferredLanguage,
        fcmToken: dto.fcmToken,
      },
    });
    return mapUser(user);
  }

  async getMyTrips(
    passengerId: string,
    query: PaginationQuery,
  ): Promise<PaginatedResponse<Trip>> {
    return this.tripService.getPassengerTrips(passengerId, query);
  }

  async getEmergencyContacts(passengerId: string): Promise<{ contacts: EmergencyContact[] }> {
    const user = await this.getMe(passengerId);
    return { contacts: user.emergencyContacts ?? [] };
  }

  async setEmergencyContacts(
    passengerId: string,
    dto: SetEmergencyContactsRequest,
  ): Promise<{ contacts: EmergencyContact[] }> {
    if (dto.contacts.length > 3) {
      throw new AppException(
        'VALIDATION_ERROR',
        undefined,
        'A passenger can save at most 3 emergency contacts',
      );
    }

    const user = await this.prisma.user.update({
      where: { id: passengerId },
      data: { emergencyContacts: dto.contacts },
    });

    return {
      contacts: (user.emergencyContacts as EmergencyContact[] | null) ?? [],
    };
  }

  async getSavedPlaces(passengerId: string): Promise<{ places: SavedPlace[] }> {
    const user = await this.getMe(passengerId);
    return { places: user.savedPlaces ?? [] };
  }

  async setSavedPlaces(
    passengerId: string,
    dto: SetSavedPlacesRequest,
  ): Promise<{ places: SavedPlace[] }> {
    const places = this.validateSavedPlaces(dto.places);

    const user = await this.prisma.user.update({
      where: { id: passengerId },
      data: { savedPlaces: places },
    });

    return {
      places: (user.savedPlaces as SavedPlace[] | null) ?? [],
    };
  }

  private validateSavedPlaces(places: SavedPlace[]): SavedPlace[] {
    if (places.length > 2) {
      throw new AppException(
        'VALIDATION_ERROR',
        undefined,
        'You can save at most 2 places (home and work)',
      );
    }

    const allowedLabels: SavedPlaceLabel[] = ['home', 'work'];
    const seen = new Set<SavedPlaceLabel>();

    return places.map((place) => {
      if (!allowedLabels.includes(place.label)) {
        throw new AppException(
          'VALIDATION_ERROR',
          undefined,
          'Saved place label must be "home" or "work"',
        );
      }

      if (seen.has(place.label)) {
        throw new AppException(
          'VALIDATION_ERROR',
          undefined,
          `Duplicate saved place label: ${place.label}`,
        );
      }
      seen.add(place.label);

      const address = place.address?.trim();
      if (!address) {
        throw new AppException(
          'VALIDATION_ERROR',
          undefined,
          'Saved place address is required',
        );
      }

      if (
        typeof place.lat !== 'number' ||
        typeof place.lng !== 'number' ||
        Number.isNaN(place.lat) ||
        Number.isNaN(place.lng)
      ) {
        throw new AppException(
          'VALIDATION_ERROR',
          undefined,
          'Saved place coordinates must be valid numbers',
        );
      }

      return {
        label: place.label,
        address,
        lat: place.lat,
        lng: place.lng,
      };
    });
  }
}
