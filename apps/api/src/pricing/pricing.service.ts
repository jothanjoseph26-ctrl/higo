import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SurgeRepository } from './surge.repository';
import { MapsService } from '../maps/maps.service';
import { VehicleType, FareEstimate, LatLng, RideMode } from '@higo/shared-types';
import { AppException } from '../common/errors/app.exception';

const DEFAULT_ROUNDING_KOBO = 5000; // Base44 DEFAULT_ROUNDING=50 naira.
const MATCH_RADIUS_KM = 2.5;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly surgeRepo: SurgeRepository,
    private readonly config: ConfigService,
    private readonly maps: MapsService,
  ) {}

  async resolveRouteMetrics(
    pickup: LatLng,
    destination: LatLng,
  ): Promise<{ distanceKm: number; durationMin: number }> {
    const route = await this.maps.getDirections(pickup, destination);
    const distanceKm = Math.round((route.distanceMeters / 1000) * 10) / 10;
    const durationMin = Math.max(1, Math.ceil(route.durationSeconds / 60));
    return { distanceKm, durationMin };
  }

  async estimateFare(input: {
    vehicleType: VehicleType;
    distanceKm: number;
    durationMin: number;
    pickup: LatLng;
    destination?: LatLng;
    isShared?: boolean;
    rideMode?: RideMode;
    promoCode?: string;
    city?: string;
    rideType?: string;
  }): Promise<FareEstimate> {
    // --- City-based PricingConfig lookup (city first, fallback to global) ---
    let pricingConfig = input.city
      ? await this.prisma.pricingConfig.findFirst({
          where: { vehicleType: input.vehicleType, isActive: true, city: input.city },
        })
      : null;
    if (!pricingConfig) {
      pricingConfig = await this.prisma.pricingConfig.findFirst({
        where: { vehicleType: input.vehicleType, isActive: true },
      });
    }

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
    let minimumFare = pricingConfig.minFare;
    const roundingIncrement = pricingConfig.roundingIncrement || DEFAULT_ROUNDING_KOBO;
    const customerBookingFee = pricingConfig.customerBookingFee || 0;
    const customerStatutoryLevy = pricingConfig.customerStatutoryLevy || 0;
    const rideMode = input.rideMode ?? (input.isShared ? RideMode.SHARE : RideMode.INSTANT);

    const distanceFare = Math.round(input.distanceKm * perKmFare);
    const timeFare = Math.round(input.durationMin * perMinFare);

    let rawFare = baseFare + distanceFare + timeFare;

    // Night Premium: 10 PM - 5 AM Nigeria time (UTC+1) (+20%)
    const nigeriaHour = this.getNigeriaHour(new Date());
    const isNightPremium = nigeriaHour >= 22 || nigeriaHour < 5;
    if (isNightPremium) {
      rawFare = Math.round(rawFare * 1.2);
      minimumFare = Math.round(minimumFare * 1.2);
    }

    const surgeEnabled =
      pricingConfig.surgeEnabled || this.config.get<boolean>('SURGE_ENABLED', false);
    let surgeMultiplier = 1.0;
    let surgeZone: string | null = null;
    if (surgeEnabled) {
      surgeMultiplier = await this.surgeRepo.getSurgeMultiplier(input.pickup);
      const maxSurge = Number(pricingConfig.surgeMaximumMultiplier || 1.2);
      surgeMultiplier = Math.min(surgeMultiplier, maxSurge);
    }

    const meteredBase = Math.max(rawFare, minimumFare);
    const minimumFareApplied = rawFare < minimumFare;
    const instantFare = this.roundToIncrement(meteredBase * surgeMultiplier, roundingIncrement);

    const instantMult = Number(pricingConfig.instantMultiplier ?? 1.0);
    const negotiateRecMult = Number(pricingConfig.negotiateRecommendedMultiplier ?? 1.0);
    const negotiateMinMult = Number(pricingConfig.negotiateMinimumOfferMultiplier ?? 0.9);
    const negotiateFastMult = Number(pricingConfig.negotiateFastMatchMultiplier ?? 1.1);
    const shareMult = Number(pricingConfig.sharePassengerMultiplier ?? 0.66);
    const scheduleFlexMult = Number(pricingConfig.scheduleFlexibleMultiplier ?? 0.9);
    const scheduleExactMult = Number(pricingConfig.scheduleExactTimeMultiplier ?? 1.05);

    const instantBase = this.roundToIncrement(instantFare * instantMult, roundingIncrement);
    const negotiateRecommended = this.roundToIncrement(instantFare * negotiateRecMult, roundingIncrement);
    const negotiateMinimum = this.roundToIncrement(instantFare * negotiateMinMult, roundingIncrement);
    const negotiateFastMatch = this.roundToIncrement(instantFare * negotiateFastMult, roundingIncrement);
    const sharePerSeatBase = this.roundToIncrement(instantFare * shareMult, roundingIncrement);
    const scheduleFlexibleBase = this.roundToIncrement(instantFare * scheduleFlexMult, roundingIncrement);
    const scheduleExactBase = this.roundToIncrement(instantFare * scheduleExactMult, roundingIncrement);

    const addFees = (fare: number) => fare + customerBookingFee + customerStatutoryLevy;
    const modes = {
      instant: {
        totalFare: addFees(instantBase),
        baseFare: instantBase,
        bookingFee: customerBookingFee,
        statutoryLevy: customerStatutoryLevy,
        modeMultiplier: instantMult,
        fareBasis: 'metered_exclusive',
      },
      negotiate: {
        recommended: addFees(negotiateRecommended),
        minimumOffer: addFees(negotiateMinimum),
        fastMatch: addFees(negotiateFastMatch),
        modeMultiplier: negotiateRecMult,
      },
      share: {
        perSeat: addFees(sharePerSeatBase),
        baseFare: sharePerSeatBase,
        bookingFee: customerBookingFee,
        statutoryLevy: customerStatutoryLevy,
        requiresConfirmedMatch: pricingConfig.shareRequiresConfirmedMatch !== false,
        minimumMatchedPassengers: pricingConfig.shareMinimumMatchedPassengers ?? 2,
        maximumDetourMinutes: pricingConfig.shareMaximumDetourMinutes ?? 8,
        modeMultiplier: shareMult,
        fareBasis: 'metered_shared',
      },
      scheduleFlex: {
        totalFare: addFees(scheduleFlexibleBase),
        baseFare: scheduleFlexibleBase,
        bookingFee: customerBookingFee,
        statutoryLevy: customerStatutoryLevy,
        modeMultiplier: scheduleFlexMult,
        fareBasis: 'schedule_flexible',
      },
      scheduleExact: {
        totalFare: addFees(scheduleExactBase),
        baseFare: scheduleExactBase,
        bookingFee: customerBookingFee,
        statutoryLevy: customerStatutoryLevy,
        modeMultiplier: scheduleExactMult,
        fareBasis: 'schedule_exact',
      },
    };

    const selected = this.selectModeFare(rideMode, modes);

    // --- FareProfile corridor matching for shared rides ---
    let fareProfile: any = null;
    let sharedFareFromProfile: number | null = null;
    if (input.destination) {
      try {
        const profileWhere: any = { isActive: true, sharedFareMidNgn: { not: null } };
        if (input.city) profileWhere.city = input.city;
        const profiles = await this.prisma.fareProfile.findMany({ where: profileWhere });
        let bestMatchDist = Infinity;
        for (const p of profiles) {
          if (!p.originLat || !p.destinationLat || !p.sharedFareMidNgn) continue;
          const oLat = Number(p.originLat);
          const oLng = Number(p.originLng);
          const dLat = Number(p.destinationLat);
          const dLng = Number(p.destinationLng);
          const originDist = haversineKm(input.pickup.lat, input.pickup.lng, oLat, oLng);
          const destDist = haversineKm(input.destination.lat, input.destination.lng, dLat, dLng);
          const totalDist = originDist + destDist;
          const revOriginDist = haversineKm(input.pickup.lat, input.pickup.lng, dLat, dLng);
          const revDestDist = haversineKm(input.destination.lat, input.destination.lng, oLat, oLng);
          const revTotalDist = revOriginDist + revDestDist;
          if (originDist < MATCH_RADIUS_KM && destDist < MATCH_RADIUS_KM && totalDist < bestMatchDist) {
            bestMatchDist = totalDist;
            fareProfile = p;
          } else if (revOriginDist < MATCH_RADIUS_KM && revDestDist < MATCH_RADIUS_KM && revTotalDist < bestMatchDist) {
            bestMatchDist = revTotalDist;
            fareProfile = p;
          }
        }
        if (fareProfile) {
          sharedFareFromProfile = this.roundToIncrement(
            Number(fareProfile.sharedFareMidNgn) * 100 * surgeMultiplier, // convert NGN to kobo
            roundingIncrement,
          );
          if (minimumFare && sharedFareFromProfile < minimumFare) {
            sharedFareFromProfile = minimumFare;
          }
          // Override the share mode per-seat fare with corridor profile price
          modes.share = {
            ...modes.share,
            perSeat: (sharedFareFromProfile ?? modes.share.perSeat) + customerBookingFee + customerStatutoryLevy,
            baseFare: sharedFareFromProfile ?? modes.share.baseFare,
            fareBasis: fareProfile.dataStatus === 'confirmed' ? 'confirmed_profile_shared' : 'estimated_profile_shared',
          };
        }
      } catch {
        // FareProfile lookup is best-effort; don't fail the estimate
      }
    }

    // --- Apply promo code (to instant fare by default) ---
    let discount = 0;
    let promoApplied: { code: string; discount: number; description?: string | null } | null = null;
    if (input.promoCode) {
      try {
        const promo = await this.prisma.promoCode.findUnique({
          where: { code: input.promoCode.toUpperCase() },
        });
        if (promo && promo.isActive) {
          const now = new Date();
          const withinDate = !promo.expiresAt || promo.expiresAt >= now;
          const usesAvailable = promo.maxUses === null || promo.usedCount < promo.maxUses;
          if (withinDate && usesAvailable) {
            if (promo.discountType === 'percent') {
              discount = Math.round((modes.instant.totalFare * promo.discountValue) / 10000);
            } else {
              discount = Math.min(promo.discountValue, modes.instant.totalFare);
            }
            modes.instant = { ...modes.instant, totalFare: modes.instant.totalFare - discount };
            promoApplied = { code: promo.code, discount, description: null };
          }
        }
      } catch {
        // Promo lookup is best-effort; don't fail the estimate
      }
    }

    // --- Backward compat: resolve primary fare from ride_type if provided ---
    let totalFareFromRideType = selected.totalFare;
    if (input.rideType === 'negotiate' || input.rideType === 'negotiated') {
      totalFareFromRideType = modes.negotiate.recommended;
    } else if (input.rideType === 'share_ride' || input.rideType === 'shared' || input.rideType === 'share') {
      totalFareFromRideType = modes.share.perSeat;
    } else if (input.rideType === 'schedule_flex') {
      totalFareFromRideType = modes.scheduleFlex.totalFare;
    } else if (input.rideType === 'schedule_exact' || input.rideType === 'schedule_ride') {
      totalFareFromRideType = modes.scheduleExact.totalFare;
    }

    const negotiateRangeLow = this.roundToIncrement(instantFare * Number(pricingConfig.negotiateMinimumOfferMultiplier ?? 0.9), roundingIncrement) + customerBookingFee + customerStatutoryLevy;
    const negotiateRangeHigh = this.roundToIncrement(instantFare * Number(pricingConfig.negotiateFastMatchMultiplier ?? 1.1), roundingIncrement) + customerBookingFee + customerStatutoryLevy;

    return {
      baseFare,
      distanceFare,
      timeFare,
      rawFare,
      minimumFare,
      minimumFareApplied,
      surgeMultiplier,
      surgeZone,
      surgeEnabled,
      modeMultiplier: selected.modeMultiplier,
      quotedFare: selected.totalFare,
      totalFare: selected.totalFare,
      customerBookingFee,
      customerStatutoryLevy,
      priceIsAllIn: pricingConfig.priceIsAllIn ?? true,
      currency: pricingConfig.currency || 'NGN',
      pricingVersion: pricingConfig.pricingVersion || 'v2.0',
      distanceKm: input.distanceKm,
      durationMin: input.durationMin,
      rideMode,
      roundingIncrement,
      fareBasis: selected.fareBasis,
      modes,
      totalFareFromRideType,
      negotiationRangeLow: negotiateRangeLow,
      negotiationRangeHigh: negotiateRangeHigh,
      sharedFare: sharedFareFromProfile,
      fareProfileMatched: !!fareProfile,
      fareProfileRoute: fareProfile ? `${fareProfile.origin} → ${fareProfile.destination}` : null,
      ...(promoApplied ? { promoCode: promoApplied.code, promoDiscount: promoApplied.discount, originalTotalFare: selected.totalFare + discount } : {}),
    };
  }

  private selectModeFare(
    rideMode: RideMode,
    modes: FareEstimate['modes'],
  ): { totalFare: number; modeMultiplier: number; fareBasis: string } {
    switch (rideMode) {
      case RideMode.NEGOTIATE:
        return {
          totalFare: modes.negotiate.recommended,
          modeMultiplier: modes.negotiate.modeMultiplier,
          fareBasis: 'metered_negotiated',
        };
      case RideMode.SHARE:
        return {
          totalFare: modes.share.perSeat,
          modeMultiplier: modes.share.modeMultiplier,
          fareBasis: modes.share.fareBasis,
        };
      case RideMode.SCHEDULE_FLEX:
        return {
          totalFare: modes.scheduleFlex.totalFare,
          modeMultiplier: modes.scheduleFlex.modeMultiplier,
          fareBasis: modes.scheduleFlex.fareBasis,
        };
      case RideMode.SCHEDULE_EXACT:
        return {
          totalFare: modes.scheduleExact.totalFare,
          modeMultiplier: modes.scheduleExact.modeMultiplier,
          fareBasis: modes.scheduleExact.fareBasis,
        };
      case RideMode.INSTANT:
      default:
        return {
          totalFare: modes.instant.totalFare,
          modeMultiplier: modes.instant.modeMultiplier,
          fareBasis: modes.instant.fareBasis,
        };
    }
  }

  private roundToIncrement(amount: number, increment = DEFAULT_ROUNDING_KOBO): number {
    return Math.round(amount / increment) * increment;
  }

  private getNigeriaHour(now: Date): number {
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const nigeriaTime = new Date(utc + 3600000);
    return nigeriaTime.getHours();
  }
}
