import { validateTransition } from './trip-state-machine';
import { TripStatus } from '@higo/shared-types';

describe('Trip Engine Unit Tests', () => {
  describe('State Machine Transitions', () => {
    it('should allow valid transitions', () => {
      expect(validateTransition(TripStatus.REQUESTED, TripStatus.MATCHED)).toBe(true);
      expect(validateTransition(TripStatus.REQUESTED, TripStatus.CANCELLED)).toBe(true);
      expect(validateTransition(TripStatus.MATCHED, TripStatus.EN_ROUTE)).toBe(true);
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
});
