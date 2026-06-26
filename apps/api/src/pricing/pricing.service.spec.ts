import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PricingService } from './pricing.service';
import { PrismaService } from '../prisma/prisma.service';
import { SurgeRepository } from './surge.repository';
import { VehicleType } from '@higo/shared-types';
import { AppException } from '../common/errors/app.exception';

describe('PricingService', () => {
  let service: PricingService;
  let prisma: { pricingConfig: { findFirst: jest.Mock } };
  let surgeRepo: { getSurgeMultiplier: jest.Mock };
  let configGet: jest.Mock;

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PricingService,
        { provide: PrismaService, useValue: prisma },
        { provide: SurgeRepository, useValue: surgeRepo },
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
    expect(estimate.totalFare).toBe(132500);
    expect(estimate.surgeMultiplier).toBe(1.0);
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

    expect(estimate.totalFare).toBe(70000);
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

    expect(estimate.totalFare).toBe(159000);
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
    expect(estimate.totalFare).toBe(198750);
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

    expect(estimate.totalFare).toBe(238500);
  });
});