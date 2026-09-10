import { Controller, Get, Query, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception';
import { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { CallsService } from './calls.service';

@Controller('calls')
export class CallsController {
  constructor(
    private readonly callsService: CallsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('token')
  @HttpCode(HttpStatus.OK)
  async getCallToken(
    @Query('tripId') tripId: string,
    @Req() req: { user: AuthUser },
  ) {
    if (!tripId) {
      throw new AppException('BAD_REQUEST', undefined, 'tripId is required');
    }

    // Verify user is participant in the trip
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { passengerId: true, driverId: true, status: true },
    });

    if (!trip) {
      throw new AppException('NOT_FOUND', undefined, 'Trip not found');
    }

    const userId = req.user.sub;
    const isPassenger = req.user.type === 'passenger' && trip.passengerId === userId;
    const isDriver = req.user.type === 'driver' && trip.driverId === userId;

    if (!isPassenger && !isDriver) {
      throw new AppException('FORBIDDEN', undefined, 'Not a participant in this trip');
    }

    const credentials = await this.callsService.getTurnCredentials();
    return credentials;
  }
}
