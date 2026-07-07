import { Controller, Post, Get, Body, Param, Query } from '@nestjs/common';
import { LatLng, PaginationQuery, RequestTripRequest } from '@higo/shared-types';
import { TripService } from './trips.service';
import { RequestTripDto, QuoteTripDto, CancelTripDto, RateDriverDto, RatePassengerDto, TripSosDto } from './dto/trip.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user';
import { AppException } from '../common/errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

function normalizeLatLng(point: LatLng): LatLng {
  return {
    lat: point.lat,
    lng: point.lng,
  };
}

function normalizeRequestTripDto(dto: RequestTripDto): RequestTripRequest {
  return {
    pickup: normalizeLatLng(dto.pickup),
    pickupAddress: dto.pickupAddress,
    destination: normalizeLatLng(dto.destination),
    destinationAddress: dto.destinationAddress,
    vehicleType: dto.vehicleType,
    paymentMethod: dto.paymentMethod,
    isShared: dto.isShared,
    promoCode: dto.promoCode,
  };
}

@Controller('trips')
export class TripsController {
  constructor(
    private readonly tripService: TripService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('request')
  async requestTrip(@CurrentUser() user: AuthUser, @Body() dto: RequestTripDto) {
    if (user.type !== 'passenger') {
      throw new AppException('FORBIDDEN', undefined, 'Only passengers can request a trip');
    }
    return this.tripService.requestTrip(user.sub, normalizeRequestTripDto(dto));
  }

  @Post('quote')
  async quoteTrip(@CurrentUser() user: AuthUser, @Body() dto: QuoteTripDto) {
    if (user.type !== 'passenger') {
      throw new AppException('FORBIDDEN', undefined, 'Only passengers can quote a trip');
    }
    return this.tripService.quoteTrip(user.sub, normalizeRequestTripDto(dto));
  }

  @Post('cancel')
  async cancelTrip(@CurrentUser() user: AuthUser, @Body() dto: CancelTripDto) {
    let activeTrip: any;

    if (user.type === 'passenger') {
      activeTrip = await this.prisma.trip.findFirst({
        where: {
          passengerId: user.sub,
          status: { in: ['requested', 'matched', 'en_route', 'active'] },
        },
      });
    } else if (user.type === 'driver') {
      activeTrip = await this.prisma.trip.findFirst({
        where: {
          driverId: user.sub,
          status: { in: ['matched', 'en_route', 'active'] },
        },
      });
    }

    if (!activeTrip) {
      throw new AppException('NOT_FOUND', undefined, 'No active trip found to cancel');
    }

    const cancelledBy = user.type === 'passenger' ? 'passenger' : 'driver';
    return this.tripService.cancelTrip(activeTrip.id, cancelledBy, dto.reason);
  }

  @Get('history')
  async getHistoryAlias(@CurrentUser() user: AuthUser, @Query() query: PaginationQuery) {
    if (user.type !== 'passenger') {
      throw new AppException('FORBIDDEN', undefined, 'Only passengers can view trip history');
    }
    return this.tripService.getPassengerTrips(user.sub, query);
  }

  @Post(':id/cancel')
  async cancelTripById(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CancelTripDto,
  ) {
    if (user.type !== 'passenger' && user.type !== 'driver') {
      throw new AppException('FORBIDDEN', undefined, 'Only trip parties can cancel trips');
    }
    await this.tripService.assertTripAccess(id, user);
    const cancelledBy = user.type === 'passenger' ? 'passenger' : 'driver';
    return this.tripService.cancelTrip(id, cancelledBy, dto.reason);
  }

  @Get(':id')
  async getTrip(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const trip = await this.tripService.getTrip(id);
    if (!trip) {
      throw new AppException('NOT_FOUND', undefined, 'Trip not found');
    }
    this.tripService.assertTripVisibleToUser(trip, user);
    return trip;
  }

  @Get(':id/status')
  async getTripStatus(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.tripService.assertTripAccess(id, user);
    return this.tripService.getTripStatus(id);
  }

  @Post(':id/rate-driver')
  async rateDriver(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RateDriverDto,
  ) {
    if (user.type !== 'passenger') {
      throw new AppException('FORBIDDEN', undefined, 'Only passengers can rate drivers');
    }
    await this.tripService.assertTripAccess(id, user);
    return this.tripService.rateDriver(id, dto.rating, dto.comment);
  }

  @Post(':id/rate-passenger')
  async ratePassenger(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RatePassengerDto,
  ) {
    if (user.type !== 'driver') {
      throw new AppException('FORBIDDEN', undefined, 'Only drivers can rate passengers');
    }
    await this.tripService.assertTripAccess(id, user);
    return this.tripService.ratePassenger(id, dto.rating, dto.comment);
  }

  @Post(':id/sos')
  async sos(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: TripSosDto) {
    await this.tripService.assertTripAccess(id, user);
    // SOS Alerts trigger notifications to passenger emergency contacts and ops control room.
    // Stubbed response as per specs.
    return {
      alertId: crypto.randomUUID(),
      contactsNotified: 2,
      controlRoomNotified: true,
    };
  }
}
