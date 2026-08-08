import { Controller, Post, Get, Body, Param, Query } from '@nestjs/common';
import { IsOptional, IsString, IsArray, IsEnum } from 'class-validator';
import { LatLng, PaginationQuery, RequestTripRequest, VehicleType } from '@higo/shared-types';
import { TripService } from './trips.service';
import {
  RequestTripDto,
  QuoteTripDto,
  CancelTripDto,
  RateDriverDto,
  RatePassengerDto,
  TripSosDto,
  FindSharedRideDto,
} from './dto/trip.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user';
import { AppException } from '../common/errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

// ─── Dispute DTO ─────────────────────────────────────────────────────────────

export class CreateDisputeDto {
  @IsString()
  type!: string; // fare_dispute, no_show, safety, payment

  @IsString()
  description!: string;

  @IsOptional()
  @IsArray()
  evidenceUrls?: string[];
}

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
    rideMode: dto.rideMode,
    scheduledFor: dto.scheduledFor,
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

  @Post('shared/find')
  async findSharedRide(@CurrentUser() user: AuthUser, @Body() dto: FindSharedRideDto) {
    if (user.type !== 'passenger') {
      throw new AppException('FORBIDDEN', undefined, 'Only passengers can find shared rides');
    }
    return this.tripService.findSharedRideMatches(
      normalizeLatLng(dto.pickup),
      normalizeLatLng(dto.destination),
      dto.vehicleType ?? VehicleType.KEKE,
    );
  }

  @Post('shared/:id/join')
  async joinSharedRide(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    if (user.type !== 'passenger') {
      throw new AppException('FORBIDDEN', undefined, 'Only passengers can join shared rides');
    }
    return this.tripService.joinSharedRide(user.sub, id);
  }

  @Post('negotiation/suggestions')
  async negotiationSuggestions(
    @CurrentUser() user: AuthUser,
    @Body() dto: { estimatedFare: number },
  ) {
    if (user.type !== 'passenger') {
      throw new AppException('FORBIDDEN', undefined, 'Only passengers can request negotiation suggestions');
    }
    return this.tripService.getFareNegotiationSuggestions(dto.estimatedFare);
  }

  @Post(':id/negotiate')
  async createNegotiation(
    @CurrentUser() user: AuthUser,
    @Body()
    dto: {
      passengerName?: string;
      pickup?: LatLng;
      pickupAddress?: string;
      destination?: LatLng;
      destinationAddress?: string;
      vehicleType?: VehicleType;
      estimatedFare?: number;
      distanceKm?: number;
      durationMin?: number;
      passengerOffer?: number;
    },
  ) {
    if (user.type !== 'passenger') {
      throw new AppException('FORBIDDEN', undefined, 'Only passengers can create negotiations');
    }
    if (
      !dto.pickup ||
      !dto.destination ||
      !dto.pickupAddress ||
      !dto.destinationAddress ||
      !dto.estimatedFare ||
      !dto.passengerOffer
    ) {
      throw new AppException('VALIDATION_ERROR', undefined, 'Missing negotiation fields');
    }

    return this.tripService.createFareNegotiation(user.sub, {
      passengerName: dto.passengerName,
      pickupAddress: dto.pickupAddress,
      pickup: normalizeLatLng(dto.pickup),
      destinationAddress: dto.destinationAddress,
      destination: normalizeLatLng(dto.destination),
      vehicleType: dto.vehicleType ?? VehicleType.KEKE,
      estimatedFare: dto.estimatedFare,
      distanceKm: dto.distanceKm,
      durationMin: dto.durationMin,
      passengerOffer: dto.passengerOffer,
    });
  }

  @Post(':id/negotiate/:negotiationId/respond')
  async respondToNegotiation(
    @CurrentUser() user: AuthUser,
    @Param('negotiationId') negotiationId: string,
    @Body()
    dto: {
      action?: 'driver_respond' | 'counter_offer' | 'select_driver' | 'cancel' | 'get_state';
      responseType?: 'accept' | 'reject' | 'counter';
      response_type?: 'accept' | 'reject' | 'counter';
      counterAmount?: number;
      counter_amount?: number;
      newOffer?: number;
      new_offer?: number;
      driverId?: string;
      driver_id?: string;
    },
  ) {
    return this.tripService.respondToFareNegotiation(user, negotiationId, {
      action: dto.action ?? 'get_state',
      responseType: dto.responseType ?? dto.response_type,
      counterAmount: dto.counterAmount ?? dto.counter_amount,
      newOffer: dto.newOffer ?? dto.new_offer,
      driverId: dto.driverId ?? dto.driver_id,
    });
  }

  @Post('cancel')
  async cancelTrip(@CurrentUser() user: AuthUser, @Body() dto: CancelTripDto) {
    let activeTrip: any;

    if (user.type === 'passenger') {
      activeTrip = await this.prisma.trip.findFirst({
        where: {
          passengerId: user.sub,
          status: { in: ['requested', 'matched', 'arrived', 'en_route', 'active'] },
        },
      });
    } else if (user.type === 'driver') {
      activeTrip = await this.prisma.trip.findFirst({
        where: {
          driverId: user.sub,
          status: { in: ['matched', 'arrived', 'en_route', 'active'] },
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

  @Post(':id/arrived')
  async driverArrived(
    @CurrentUser() user: AuthUser,
    @Param('id') tripId: string,
  ) {
    if (user.type !== 'driver') {
      throw new AppException('FORBIDDEN', undefined, 'Only drivers can confirm arrival');
    }
    await this.tripService.assertTripAccess(tripId, user);
    await this.tripService.transition(tripId, 'arrived' as any, 'driver');
    return { success: true };
  }

  @Post(':id/start')
  async startTrip(
    @CurrentUser() user: AuthUser,
    @Param('id') tripId: string,
  ) {
    if (user.type !== 'driver') {
      throw new AppException('FORBIDDEN', undefined, 'Only drivers can start a trip');
    }
    await this.tripService.assertTripAccess(tripId, user);
    await this.tripService.transition(tripId, 'active' as any, 'driver');
    return { success: true };
  }

  @Post(':id/complete')
  async completeTrip(
    @CurrentUser() user: AuthUser,
    @Param('id') tripId: string,
  ) {
    if (user.type !== 'driver') {
      throw new AppException('FORBIDDEN', undefined, 'Only drivers can complete a trip');
    }
    await this.tripService.assertTripAccess(tripId, user);
    await this.tripService.transition(tripId, 'completed' as any, 'driver');
    return { success: true };
  }

  @Post(':id/dispute')
  async createDispute(
    @CurrentUser() user: AuthUser,
    @Param('id') tripId: string,
    @Body() dto: CreateDisputeDto,
  ) {
    await this.tripService.assertTripAccess(tripId, user);

    const dispute = await this.prisma.dispute.create({
      data: {
        tripId,
        raisedBy: user.type === 'driver' ? 'driver' : 'passenger',
        type: dto.type,
        description: dto.description,
        evidenceUrls: dto.evidenceUrls ?? [],
      },
    });

    return { disputeId: dispute.id, status: dispute.status };
  }
}
