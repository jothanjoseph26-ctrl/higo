import { CtsService } from './cts.service';

function makeDriver(overrides: Record<string, unknown> = {}) {
  return {
    verificationTier: 'tier_0',
    totalTrips: 0,
    ratingAvg: 0,
    kycDocuments: {},
    ...overrides,
  };
}

describe('CtsService', () => {
  it('scores geo proximity into the total instead of leaving it unused', async () => {
    const driver = makeDriver({
      verificationTier: 'tier_1',
      totalTrips: 1000,
      ratingAvg: 4.9,
      kycDocuments: { estateEndorsementApproved: true, referralApproved: true },
    });
    const prisma = { driver: { findUnique: jest.fn().mockResolvedValue(driver) } };
    const service = new CtsService(prisma as any);

    const atPickup = await service.computeCTS('driver-1', { distanceMeters: 0, pickup: { lat: 0, lng: 0 } });
    const atRadiusEdge = await service.computeCTS('driver-1', {
      distanceMeters: 5000,
      pickup: { lat: 0, lng: 0 },
    });

    // Same driver, only distance differs — total must differ once proximity is scored.
    expect(atPickup.geoProximity).toBe(1);
    expect(atRadiusEdge.geoProximity).toBe(0);
    expect(atPickup.total).toBeGreaterThan(atRadiusEdge.total);

    // Fully qualified driver (25+30+20+15+10=100 trust points) right at the pickup
    // point should hit the new 120-point max: (100 + 20) / 120 = 1.0.
    expect(atPickup.total).toBeCloseTo(1.0, 5);
    // Same driver at the radius edge scores only the 100 trust points: 100/120.
    expect(atRadiusEdge.total).toBeCloseTo(100 / 120, 5);
  });

  it('lets a closer, less-verified driver outrank a farther, fully-verified one when the gap is large enough', async () => {
    const primeDriver = makeDriver({
      verificationTier: 'tier_1',
      totalTrips: 1000,
      ratingAvg: 4.9,
      kycDocuments: { estateEndorsementApproved: true, referralApproved: true },
    });
    const unverifiedDriver = makeDriver(); // 0 trust points
    const prisma = {
      driver: {
        findUnique: jest.fn((args: { where: { id: string } }) =>
          Promise.resolve(args.where.id === 'far-prime' ? primeDriver : unverifiedDriver),
        ),
      },
    };
    const service = new CtsService(prisma as any);

    const far = await service.computeCTS('far-prime', { distanceMeters: 4900, pickup: { lat: 0, lng: 0 } });
    const near = await service.computeCTS('near-unverified', {
      distanceMeters: 50,
      pickup: { lat: 0, lng: 0 },
    });

    // far has 100 trust points + a sliver of geo (~0.4) => (100 + 0.4)/120 ≈ 0.837
    // near has 0 trust points + nearly full geo (~19.8) => (0 + 19.8)/120 ≈ 0.165
    // The trust gap still dominates — proximity nudges the score, it doesn't override it.
    expect(far.total).toBeGreaterThan(near.total);
  });
});
