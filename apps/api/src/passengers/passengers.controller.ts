import { Body, Controller, Get, Patch, Post, Put, Query } from '@nestjs/common';
import {
  PaginationQuery,
  SetEmergencyContactsRequest,
  SetSavedPlacesRequest,
  UpdateMyProfileRequest,
} from '@higo/shared-types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AppException } from '../common/errors/app.exception';
import { AuthUser } from '../common/types/auth-user';
import { PassengersService } from './passengers.service';

@Controller('passengers')
export class PassengersController {
  constructor(private readonly passengersService: PassengersService) {}

  @Get('me')
  async getMe(@CurrentUser() user: AuthUser) {
    this.assertPassenger(user);
    return this.passengersService.getMe(user.sub);
  }

  @Patch('me')
  async updateMe(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateMyProfileRequest,
  ) {
    this.assertPassenger(user);
    return this.passengersService.updateMe(user.sub, dto);
  }

  @Get('profile')
  async getProfileAlias(@CurrentUser() user: AuthUser) {
    return this.getMe(user);
  }

  @Patch('profile')
  async updateProfileAlias(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateMyProfileRequest,
  ) {
    return this.updateMe(user, dto);
  }

  @Get('me/trips')
  async getMyTrips(@CurrentUser() user: AuthUser, @Query() query: PaginationQuery) {
    this.assertPassenger(user);
    return this.passengersService.getMyTrips(user.sub, query);
  }

  @Get('me/emergency-contacts')
  async getEmergencyContacts(@CurrentUser() user: AuthUser) {
    this.assertPassenger(user);
    return this.passengersService.getEmergencyContacts(user.sub);
  }

  @Post('emergency-contacts')
  async setEmergencyContacts(
    @CurrentUser() user: AuthUser,
    @Body() dto: SetEmergencyContactsRequest,
  ) {
    this.assertPassenger(user);
    return this.passengersService.setEmergencyContacts(user.sub, dto);
  }

  @Get('me/saved-places')
  async getSavedPlaces(@CurrentUser() user: AuthUser) {
    this.assertPassenger(user);
    return this.passengersService.getSavedPlaces(user.sub);
  }

  @Put('me/saved-places')
  async setSavedPlaces(
    @CurrentUser() user: AuthUser,
    @Body() dto: SetSavedPlacesRequest,
  ) {
    this.assertPassenger(user);
    return this.passengersService.setSavedPlaces(user.sub, dto);
  }

  private assertPassenger(user: AuthUser) {
    if (user.type !== 'passenger') {
      throw new AppException('FORBIDDEN', undefined, 'Only passengers can use this endpoint');
    }
  }
}
