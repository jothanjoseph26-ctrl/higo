/* eslint-disable @typescript-eslint/no-explicit-any */
import { MatchingService } from './matching.service';

function makeService(overrides: {
  findDrivers?: any[];
  getTrip?: any;
} = {}) {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(null) },
  } as any;
  const redis = {
    raw: {
      smembers: jest.fn().mockResolvedValue([]),
      sadd: jest.fn(),
    },
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    expire: jest.fn(),
  } as any;
  const geoRepo = {
    findNearestOnlineDrivers: jest.fn().mockResolvedValue(overrides.findDrivers ?? []),
  } as any;
  const ctsService = {
    computeCTS: jest.fn().mockResolvedValue({ total: 0.5 }),
  } as any;
  const tripService = {
    getTrip: jest.fn().mockResolvedValue(overrides.getTrip ?? null),
    transition: jest.fn(),
  } as any;
  const eventsGateway = {
    server: { to: jest.fn().mockReturnThis(), emit: jest.fn() },
    getDriverSocketCount: jest.fn().mockResolvedValue(0),
  } as any;
  const pushService = { sendToDriver: jest.fn() } as any;
  const webPushService = { sendToDriver: jest.fn() } as any;
  const settings = {
    getMatchSettings: jest.fn().mockResolvedValue({ radiusMeters: 5000, offerTimeoutSec: 30 }),
  } as any;
  const presenceService = {
    getPresenceTtl: jest.fn().mockResolvedValue(-2),
  } as any;
  const dispatchQueue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) } as any;

  const service = new MatchingService(
    prisma, redis, geoRepo, ctsService, tripService,
    eventsGateway, pushService, webPushService, settings, presenceService, dispatchQueue,
  );

  return { service, geoRepo, tripService };
}

describe('MatchingService — P0 city passthrough', () => {
  it('findCandidates passes city to geoRepo when provided', async () => {
    const { service, geoRepo } = makeService();

    await service.findCandidates(
      { lat: 9.0579, lng: 7.4951 },
      'keke' as any,
      'Abuja',
    );

    expect(geoRepo.findNearestOnlineDrivers).toHaveBeenCalledWith(
      { lat: 9.0579, lng: 7.4951 },
      'keke',
      5000,
      'Abuja',
    );
  });

  it('findCandidates passes undefined city when not provided', async () => {
    const { service, geoRepo } = makeService();

    await service.findCandidates(
      { lat: 9.0579, lng: 7.4951 },
      'keke' as any,
    );

    expect(geoRepo.findNearestOnlineDrivers).toHaveBeenCalledWith(
      { lat: 9.0579, lng: 7.4951 },
      'keke',
      5000,
      undefined,
    );
  });

  it('dispatch passes trip.city to findCandidates', async () => {
    const trip = {
      id: 'trip-1',
      status: 'requested',
      pickupLocation: { lat: 9.0579, lng: 7.4951 },
      vehicleType: 'keke',
      city: 'Abuja',
      passengerId: 'p1',
      driverId: null,
      pickupAddress: 'Test',
      destinationLocation: { lat: 9.06, lng: 7.5 },
      destinationAddress: 'Test2',
      totalFare: 1000,
      surgeMultiplier: 1.0,
      distanceKm: 5.0,
      durationMin: 15,
    };
    const { service, geoRepo } = makeService({ getTrip: trip });

    await service.dispatch('trip-1');

    expect(geoRepo.findNearestOnlineDrivers).toHaveBeenCalledWith(
      { lat: 9.0579, lng: 7.4951 },
      'keke',
      5000,
      'Abuja',
    );
  });

  it('dispatch passes undefined city when trip.city is null', async () => {
    const trip = {
      id: 'trip-1',
      status: 'requested',
      pickupLocation: { lat: 9.0579, lng: 7.4951 },
      vehicleType: 'keke',
      city: null,
      passengerId: 'p1',
      driverId: null,
      pickupAddress: 'Test',
      destinationLocation: { lat: 9.06, lng: 7.5 },
      destinationAddress: 'Test2',
      totalFare: 1000,
      surgeMultiplier: 1.0,
      distanceKm: 5.0,
      durationMin: 15,
    };
    const { service, geoRepo } = makeService({ getTrip: trip });

    await service.dispatch('trip-1');

    expect(geoRepo.findNearestOnlineDrivers).toHaveBeenCalledWith(
      { lat: 9.0579, lng: 7.4951 },
      'keke',
      5000,
      undefined,
    );
  });
});
