import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SurgeRepository } from './surge.repository';
import { VehicleType, FareEstimate, LatLng } from '@higo/shared-types';
import { AppException } from '../common/errors/app.exception';

@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly surgeRepo: SurgeRepository,
    private readonly config: ConfigService,
  ) {}

  async estimateFare(input: {
    vehicleType: VehicleType;
    distanceKm: number;
    durationMin: number;
    pickup: LatLng;
    isShared?: boolean;
  }): Promise<FareEstimate> {
    const pricingConfig = await this.prisma.pricingConfig.findFirst({
      where: {
        vehicleType: input.vehicleType,
        isActive: true,
      },
    });

    if (!pricingConfig) {
      throw new AppException(
        'NOT_FOUND',
        undefined,
        `No active pricing config for vehicle type: ${input.vehicleType}`,
      );
    }

    const baseFare = pricingConfig.baseFare;
    const perKmFare = pricingConfig.perKmFare;
    const perMinFare = pricingConfig.perMinFare;
    let minFare = pricingConfig.minFare;

    const distanceFare = Math.round(input.distanceKm * perKmFare);
    const timeFare = Math.round(input.durationMin * perMinFare);

    let subtotal = baseFare + distanceFare + timeFare;

    // Night Premium: 10 PM - 5 AM Nigeria time (UTC+1) (+20%)
    const nigeriaHour = this.getNigeriaHour(new Date());
    const isNightPremium = nigeriaHour >= 22 || nigeriaHour < 5;
    if (isNightPremium) {
      subtotal = Math.round(subtotal * 1.2);
      minFare = Math.round(minFare * 1.2);
    }

    const surgeEnabled = this.config.get<boolean>('SURGE_ENABLED', false);
    let surgeMultiplier = 1.0;
    if (surgeEnabled) {
      surgeMultiplier = await this.surgeRepo.getSurgeMultiplier(input.pickup);
      subtotal = Math.round(subtotal * surgeMultiplier);
    }

    const totalFare = Math.max(minFare, subtotal);

    return {
      baseFare,
      distanceFare,
      timeFare,
      surgeMultiplier,
      totalFare,
      distanceKm: input.distanceKm,
      durationMin: input.durationMin,
    };
  }

  private getNigeriaHour(now: Date): number {
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const nigeriaTime = new Date(utc + 3600000);
    return nigeriaTime.getHours();
  }
}