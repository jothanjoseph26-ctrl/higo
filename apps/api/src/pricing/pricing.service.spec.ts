import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PricingService } from './pricing.service';
import { PrismaService } from '../prisma/prisma.service';
import { SurgeRepository } from './surge.repository';
import { MapsService } from '../maps/maps.service';
import { RideMode, VehicleType } from '@higo/shared-types';
import { AppException } from '../common/errors/app.exception';

describe('PricingService', () => {
  let service: PricingService;
  let prisma: { pricingConfig: { findFirst: jest.Mock } };
  let surgeRepo: { getSurgeMultiplier: jest.Mock };
  let configGet: jest.Mock;
  let maps: { getDirections: jest.Mock };

  const pickup = { lat: 9.0765, lng: 7.3986 };

  const kekeConfig = {
    id: 'cfg-keke',
    vehicleType: 'keke',
    baseFare: 50000,
    perKmFare: 12000,
    perMinFare: 1500,
    minFare: 70000,
    currency: 'NGN',
    isActive: true,
    roundingIncrement: 5000,
    customerBookingFee: 0,
    // customerStatutoryLevy intentionally omitted - the service now computes
    // this itself as FCT_LEVY_RATE * instantFare rather than reading it from
    // PricingConfig (see pricing.service.ts).
    instantMultiplier: 1.0,
    negotiateRecommendedMultiplier: 1.0,
    negotiateMinimumOfferMultiplier: 0.9,
    negotiateFastMatchMultiplier: 1.1,
    sharePassengerMultiplier: 0.66,
    shareMinimumMatchedPassengers: 2,
    shareRequiresConfirmedMatch: true,
    shareMaximumDetourMinutes: 8,
    scheduleFlexibleMultiplier: 0.9,
    scheduleExactTimeMultiplier: 1.05,
    surgeEnabled: false,
    surgeMaximumMultiplier: 2.0,
    pricingVersion: 'v2.0',
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      pricingConfig: {
        findFirst: jest.fn(),
      },
    };

    surgeRepo = {
      getSurgeMultiplier: jest.fn().mockResolvedValue(1.0),
    };

    configGet = jest.fn().mockReturnValue(false);
    maps = {
      getDirections: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PricingService,
        { provide: PrismaService, useValue: prisma },
        { provide: SurgeRepository, useValue: surgeRepo },
        { provide: MapsService, useValue: maps },
        {
          provide: ConfigService,
          useValue: {
            get: configGet,
          },
        },
      ],
    }).compile();

    service = module.get<PricingService>(PricingService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reads active PricingConfig for vehicleType from DB', async () => {
    prisma.pricingConfig.findFirst.mockResolvedValue(kekeConfig);
    jest.useFakeTimers().setSystemTime(new Date('2026-06-25T12:00:00Z'));

    const estimate = await service.estimateFare({
      vehicleType: VehicleType.KEKE,
      distanceKm: 5,
      durationMin: 15,
      pickup,
    });

    expect(prisma.pricingConfig.findFirst).toHaveBeenCalledWith({
      where: { vehicleType: VehicleType.KEKE, isActive: true },
    });
    expect(estimate.baseFare).toBe(50000);
    expect(estimate.distanceFare).toBe(60000);
    expect(estimate.timeFare).toBe(22500);
    expect(estimate.rawFare).toBe(132500);
    expect(estimate.totalFare).toBe(145125);
    expect(estimate.quotedFare).toBe(145125);
    expect(estimate.customerStatutoryLevy).toBeUndefined();
    expect(estimate.modes.instant.statutoryLevy).toBeUndefined();
    expect(estimate.customerVat).toBe(10125);
    expect(estimate.surgeMultiplier).toBe(1.0);
  });

  it('applies FCT levy only for Abuja/FCT fares', async () => {
    prisma.pricingConfig.findFirst.mockResolvedValue(kekeConfig);
    jest.useFakeTimers().setSystemTime(new Date('2026-06-25T12:00:00Z'));

    const abujaEstimate = await service.estimateFare({
      vehicleType: VehicleType.KEKE,
      distanceKm: 5,
      durationMin: 15,
      pickup,
      city: 'Abuja',
    });

    const warriEstimate = await service.estimateFare({
      vehicleType: VehicleType.KEKE,
      distanceKm: 5,
      durationMin: 15,
      pickup,
      city: 'Warri',
    });

    expect(abujaEstimate.customerStatutoryLevy).toBe(1688);
    expect(abujaEstimate.modes.instant.statutoryLevy).toBe(1688);
    expect(abujaEstimate.customerVat).toBe(10125);
    expect(abujaEstimate.totalFare).toBe(146813);
    expect(warriEstimate.customerStatutoryLevy).toBeUndefined();
    expect(warriEstimate.modes.instant.statutoryLevy).toBeUndefined();
    expect(warriEstimate.customerVat).toBe(10125);
    expect(warriEstimate.totalFare).toBe(145125);
  });

  it('throws when no active pricing config exists', async () => {
    prisma.pricingConfig.findFirst.mockResolvedValue(null);

    await expect(
      service.estimateFare({
        vehicleType: VehicleType.CAR,
        distanceKm: 2,
        durationMin: 8,
        pickup,
      }),
    ).rejects.toThrow(AppException);
  });

  it('respects minimum fare floor', async () => {
    prisma.pricingConfig.findFirst.mockResolvedValue(kekeConfig);
    jest.useFakeTimers().setSystemTime(new Date('2026-06-25T12:00:00Z'));

    const estimate = await service.estimateFare({
      vehicleType: VehicleType.KEKE,
      distanceKm: 0.5,
      durationMin: 2,
      pickup,
    });

    expect(estimate.totalFare).toBe(75250);
  });

  it('applies night premium between 10 PM and 5 AM Nigeria time', async () => {
    prisma.pricingConfig.findFirst.mockResolvedValue(kekeConfig);
    jest.useFakeTimers().setSystemTime(new Date('2026-06-25T21:30:00Z'));

    const estimate = await service.estimateFare({
      vehicleType: VehicleType.KEKE,
      distanceKm: 5,
      durationMin: 15,
      pickup,
    });

    expect(estimate.totalFare).toBe(172000);
  });

  it('does not call surge repo when SURGE_ENABLED is false', async () => {
    prisma.pricingConfig.findFirst.mockResolvedValue(kekeConfig);
    configGet.mockReturnValue(false);
    jest.useFakeTimers().setSystemTime(new Date('2026-06-25T12:00:00Z'));

    await service.estimateFare({
      vehicleType: VehicleType.KEKE,
      distanceKm: 5,
      durationMin: 15,
      pickup,
    });

    expect(surgeRepo.getSurgeMultiplier).not.toHaveBeenCalled();
  });

  it('applies surge multiplier when SURGE_ENABLED is true', async () => {
    prisma.pricingConfig.findFirst.mockResolvedValue(kekeConfig);
    configGet.mockImplementation((key: string) => key === 'SURGE_ENABLED');
    surgeRepo.getSurgeMultiplier.mockResolvedValue(1.5);
    jest.useFakeTimers().setSystemTime(new Date('2026-06-25T12:00:00Z'));

    const estimate = await service.estimateFare({
      vehicleType: VehicleType.KEKE,
      distanceKm: 5,
      durationMin: 15,
      pickup,
    });

    expect(surgeRepo.getSurgeMultiplier).toHaveBeenCalledWith(pickup);
    expect(estimate.surgeMultiplier).toBe(1.5);
    expect(estimate.totalFare).toBe(215000);
  });

  it('applies night premium before surge multiplier', async () => {
    prisma.pricingConfig.findFirst.mockResolvedValue(kekeConfig);
    configGet.mockImplementation((key: string) => key === 'SURGE_ENABLED');
    surgeRepo.getSurgeMultiplier.mockResolvedValue(1.5);
    jest.useFakeTimers().setSystemTime(new Date('2026-06-25T21:30:00Z'));

    const estimate = await service.estimateFare({
      vehicleType: VehicleType.KEKE,
      distanceKm: 5,
      durationMin: 15,
      pickup,
    });

    expect(estimate.totalFare).toBe(258000);
  });

  it('calculates all Base44 ride modes independently from the metered base', async () => {
    prisma.pricingConfig.findFirst.mockResolvedValue({
      ...kekeConfig,
      customerBookingFee: 5000,
    });
    jest.useFakeTimers().setSystemTime(new Date('2026-06-25T12:00:00Z'));

    const estimate = await service.estimateFare({
      vehicleType: VehicleType.KEKE,
      distanceKm: 5,
      durationMin: 15,
      pickup,
      rideMode: RideMode.NEGOTIATE,
    });

    // Default/no-city fares include VAT, but not the Abuja/FCT-only levy.
    expect(estimate.modes.instant.totalFare).toBe(150125);
    expect(estimate.modes.negotiate.recommended).toBe(150125);
    expect(estimate.modes.negotiate.minimumOffer).toBe(135125);
    expect(estimate.modes.negotiate.fastMatch).toBe(165125);
    expect(estimate.modes.share.perSeat).toBe(105125);
    expect(estimate.modes.scheduleFlex.totalFare).toBe(135125);
    expect(estimate.modes.scheduleExact.totalFare).toBe(155125);
    expect(estimate.customerStatutoryLevy).toBeUndefined();
    expect(estimate.modes.instant.statutoryLevy).toBeUndefined();
    expect(estimate.modes.share.statutoryLevy).toBeUndefined();
    expect(estimate.modes.scheduleFlex.statutoryLevy).toBeUndefined();
    expect(estimate.modes.scheduleExact.statutoryLevy).toBeUndefined();
    expect(estimate.customerVat).toBe(10125);
    expect(estimate.totalFare).toBe(150125);
    expect(estimate.rideMode).toBe(RideMode.NEGOTIATE);
  });

  it('uses MapsService for route metrics with Google-backed fallback behavior', async () => {
    maps.getDirections.mockResolvedValue({
      distanceMeters: 12340,
      durationSeconds: 121,
      polyline: [],
    });

    await expect(
      service.resolveRouteMetrics(
        { lat: 9, lng: 7 },
        { lat: 9.1, lng: 7.1 },
      ),
    ).resolves.toEqual({ distanceKm: 12.3, durationMin: 3 });
  });
});
