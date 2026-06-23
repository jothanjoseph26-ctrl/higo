import { Injectable } from '@nestjs/common';
import {
  EmergencyContact,
  PaginatedResponse,
  PaginationQuery,
  SetEmergencyContactsRequest,
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
}
