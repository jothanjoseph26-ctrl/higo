import { validateTransition } from './trip-state-machine';
import { TripService } from './trips.service';
import { TripStatus, VehicleType } from '@higo/shared-types';

describe('Trip Engine Unit Tests', () => {
  describe('State Machine Transitions', () => {
    it('should allow valid transitions', () => {
      expect(validateTransition(TripStatus.REQUESTED, TripStatus.MATCHED)).toBe(true);
      expect(validateTransition(TripStatus.REQUESTED, TripStatus.CANCELLED)).toBe(true);
      expect(validateTransition(TripStatus.MATCHED, TripStatus.EN_ROUTE)).toBe(true);
      expect(validateTransition(TripStatus.MATCHED, TripStatus.ARRIVED)).toBe(true);
      expect(validateTransition(TripStatus.ARRIVED, TripStatus.ACTIVE)).toBe(true);
      expect(validateTransition(TripStatus.MATCHED, TripStatus.CANCELLED)).toBe(true);
      expect(validateTransition(TripStatus.EN_ROUTE, TripStatus.ACTIVE)).toBe(true);
      expect(validateTransition(TripStatus.ACTIVE, TripStatus.COMPLETED)).toBe(true);
    });

    it('should reject invalid transitions', () => {
      expect(validateTransition(TripStatus.COMPLETED, TripStatus.ACTIVE)).toBe(false);
      expect(validateTransition(TripStatus.CANCELLED, TripStatus.REQUESTED)).toBe(false);
      expect(validateTransition(TripStatus.REQUESTED, TripStatus.ACTIVE)).toBe(false);
    });
  });

  describe('Fare Calculation Logic', () => {
    const calculateFare = (
      baseFare: number,
      perKmFare: number,
      perMinFare: number,
      minFare: number,
      distanceKm: number,
      durationMin: number,
      surgeMultiplier: number,
    ) => {
      const distanceFare = Math.round(distanceKm * perKmFare);
      const timeFare = Math.round(durationMin * perMinFare);
      const subtotal = baseFare + distanceFare + timeFare;
      return Math.max(minFare, Math.round(subtotal * surgeMultiplier));
    };

    it('should correctly calculate fare without surge', () => {
      const fare = calculateFare(30000, 10000, 2000, 50000, 3.5, 10, 1.0);
      expect(fare).toBe(85000);
    });

    it('should respect minimum fare floor', () => {
      const fare = calculateFare(30000, 10000, 2000, 50000, 0.5, 2, 1.0);
      expect(fare).toBe(50000);
    });

    it('should apply surge multiplier correctly', () => {
      const fare = calculateFare(30000, 10000, 2000, 50000, 3.5, 10, 1.5);
      expect(fare).toBe(127500);
    });
  });

  describe('Composite Trust Score (CTS) normalization', () => {
    const computeCtsScore = (components: {
      referralProximity: number;
      estateEndorsement: number;
      completionRate: number;
      recencyActivity: number;
      ratingScore: number;
      geoProximity: number;
      verificationTier: number;
      jobVolumeSignal: number;
    }) => {
      const score =
        components.referralProximity * 0.25 +
        components.estateEndorsement * 0.20 +
        components.completionRate * 0.15 +
        components.recencyActivity * 0.10 +
        components.ratingScore * 0.10 +
        components.geoProximity * 0.10 +
        components.verificationTier * 0.05 +
        components.jobVolumeSignal * 0.05;
      return Math.min(1.0, Math.max(0.0, score));
    };

    it('should compute weighted sum correctly', () => {
      const score = computeCtsScore({
        referralProximity: 0.8,
        estateEndorsement: 0.9,
        completionRate: 1.0,
        recencyActivity: 0.7,
        ratingScore: 4.8 / 5.0,
        geoProximity: 0.5,
        verificationTier: 1.0,
        jobVolumeSignal: 0.6,
      });
      expect(score).toBeCloseTo(0.826, 4);
    });
  });

  describe('Fare Negotiation', () => {
    const now = new Date('2026-07-28T12:00:00Z');

    const buildService = (prismaOverrides: Record<string, any> = {}) => {
      const prisma = {
        platformSettings: { findUnique: jest.fn().mockResolvedValue(null) },
        user: { findUnique: jest.fn().mockResolvedValue({ id: 'passenger-1', name: 'Ada' }) },
        driver: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'driver-1',
            name: 'Musa',
            phone: '+2348000000001',
            avatarUrl: null,
            vehiclePlate: 'ABC-123',
            vehicleModel: 'Bajaj',
            vehicleColor: 'Green',
            ratingAvg: 4.8,
            totalTrips: 10,
            kycStatus: 'approved',
          }),
        },
        fareNegotiation: {
          create: jest.fn(),
          findUnique: jest.fn(),
          findUniqueOrThrow: jest.fn(),
          update: jest.fn(),
        },
        trip: { findFirst: jest.fn().mockResolvedValue(null) },
        $executeRaw: jest.fn().mockResolvedValue(1),
        ...prismaOverrides,
      };
      const gateway = {
        server: {
          to: jest.fn().mockReturnValue({ emit: jest.fn() }),
        },
      };
      const service = new TripService(
        prisma as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        gateway as any,
        {} as any,
        {} as any,
        {} as any,
      );
      return { service, prisma };
    };

    const negotiationRow = {
      id: 'negotiation-1',
      passengerId: 'passenger-1',
      passengerName: 'Ada',
      selectedDriverId: null,
      selectedDriverName: null,
      pickupAddress: 'Apo',
      pickupLat: 9.01,
      pickupLng: 7.45,
      destinationAddress: 'Wuse',
      destinationLat: 9.08,
      destinationLng: 7.49,
      vehicleType: VehicleType.KEKE,
      estimatedFare: 150000,
      passengerOffer: 135000,
      finalFare: null,
      distanceKm: 6.5,
      durationMin: 18,
      currentRound: 1,
      maxRounds: 3,
      status: 'active',
      driverResponses: [],
      closedReason: null,
      negotiationDurationSec: null,
      expiresAt: new Date('2026-07-28T12:01:00Z'),
      createdAt: now,
      updatedAt: now,
    };

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(now);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('round-trips passenger create, driver counter, and passenger accept into a matched trip', async () => {
      const { service, prisma } = buildService();
      prisma.fareNegotiation.create.mockResolvedValue(negotiationRow);

      const created = await service.createFareNegotiation('passenger-1', {
        pickupAddress: 'Apo',
        pickup: { lat: 9.01, lng: 7.45 },
        destinationAddress: 'Wuse',
        destination: { lat: 9.08, lng: 7.49 },
        vehicleType: VehicleType.KEKE,
        estimatedFare: 150000,
        distanceKm: 6.5,
        durationMin: 18,
        passengerOffer: 135000,
      });

      expect(created.negotiation.passengerOffer).toBe(135000);

      const counterResponse = {
        driverId: 'driver-1',
        driverName: 'Musa',
        driverRating: 4.8,
        driverEtaMin: 5,
        driverVerified: true,
        responseType: 'counter',
        counterAmount: 145000,
        respondedAt: now.toISOString(),
      };
      prisma.fareNegotiation.findUnique.mockResolvedValue(negotiationRow);
      prisma.fareNegotiation.findUniqueOrThrow.mockResolvedValue(negotiationRow);
      prisma.fareNegotiation.update.mockResolvedValueOnce({
        ...negotiationRow,
        driverResponses: [counterResponse],
      });

      const countered = await service.respondToFareNegotiation(
        { sub: 'driver-1', type: 'driver' } as any,
        'negotiation-1',
        {
          action: 'driver_respond',
          responseType: 'counter',
          counterAmount: 145000,
        },
      );

      expect(countered.negotiation.driverResponses[0].counterAmount).toBe(145000);

      const withCounter = { ...negotiationRow, driverResponses: [counterResponse] };
      prisma.fareNegotiation.findUnique.mockResolvedValue(withCounter);
      prisma.fareNegotiation.findUniqueOrThrow.mockResolvedValue(withCounter);
      prisma.fareNegotiation.update.mockResolvedValueOnce({
        ...withCounter,
        status: 'accepted',
        selectedDriverId: 'driver-1',
        selectedDriverName: 'Musa',
        finalFare: 145000,
        closedReason: 'accepted',
        negotiationDurationSec: 0,
      });

      const accepted = await service.respondToFareNegotiation(
        { sub: 'passenger-1', type: 'passenger' } as any,
        'negotiation-1',
        { action: 'select_driver', driverId: 'driver-1' },
      );

      expect(accepted.negotiation.status).toBe('accepted');
      expect(accepted.rideId).toEqual(expect.any(String));
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });
  });
});
