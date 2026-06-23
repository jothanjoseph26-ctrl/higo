import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SurgeRepository } from './surge.repository';
import { VehicleType, FareEstimate, LatLng } from '@higo/shared-types';

@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly surgeRepo: SurgeRepository,
  ) {}

  async estimateFare(input: {
    vehicleType: VehicleType;
    distanceKm: number;
    durationMin: number;
    pickup: LatLng;
    isShared?: boolean;
  }): Promise<FareEstimate> {
    let baseFare = 0;
    let perKmFare = 0;
    let perMinFare = 0;
    let minFare = 0;

    if (input.isShared) {
      baseFare = 35000; // ₦350 in kobo
      perKmFare = 8000; // ₦80 in kobo
      perMinFare = 0;
      minFare = 50000; // ₦500 in kobo
    } else {
      baseFare = 50000; // ₦500 in kobo
      perKmFare = 12000; // ₦120 in kobo
      perMinFare = 1500; // ₦15 in kobo
      minFare = 70000; // ₦700 in kobo
    }

    const distanceFare = Math.round(input.distanceKm * perKmFare);
    const timeFare = Math.round(input.durationMin * perMinFare);

    let subtotal = baseFare + distanceFare + timeFare;

    // Night Premium: 10 PM - 5 AM (+20%)
    // Retrieve Nigeria time (UTC+1)
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const nigeriaTime = new Date(utc + 3600000);
    const hour = nigeriaTime.getHours();

    const isNightPremium = hour >= 22 || hour < 5;
    if (isNightPremium) {
      subtotal = Math.round(subtotal * 1.20);
      minFare = Math.round(minFare * 1.20);
    }

    // Surge disabled initially for launch as per policy
    const surgeMultiplier = 1.0;
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
}
