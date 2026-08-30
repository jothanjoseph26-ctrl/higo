/* eslint-disable @typescript-eslint/no-explicit-any */
import { GeoRepository } from './geo.repository';

function makeRepo(queryRawFn: any) {
  const prisma = { $queryRaw: queryRawFn, $executeRaw: jest.fn() } as any;
  const settings = { getMatchSettings: jest.fn().mockResolvedValue({ radiusMeters: 5000 }) } as any;
  return new GeoRepository(prisma, settings);
}

/**
 * Prisma parameterizes template literal values, so the city value doesn't
 * appear literally in the SQL string. Instead we verify the template
 * structure contains `city =` and the raw call count / args.
 */
describe('GeoRepository — P0 city filter', () => {
  it('includes city filter when city is provided', async () => {
    const queryRaw = jest.fn().mockResolvedValue([{ id: 'd1', dist: 500 }]);
    const repo = makeRepo(queryRaw);

    const result = await repo.findNearestOnlineDrivers(
      { lat: 9.0579, lng: 7.4951 },
      'keke' as any,
      5000,
      'Abuja',
    );

    expect(result).toEqual([{ id: 'd1', distanceMeters: 500 }]);

    // Prisma tagged template: first arg is the template string array
    const templateParts = queryRaw.mock.calls[0][0];
    const sql = templateParts.join('');
    expect(sql).toContain('city =');
    // The actual value is passed as a subsequent argument to $queryRaw
    expect(queryRaw.mock.calls[0]).toContain('Abuja');
  });

  it('excludes NULL-city drivers when city filter is active', async () => {
    const queryRaw = jest.fn().mockResolvedValue([]);
    const repo = makeRepo(queryRaw);

    const result = await repo.findNearestOnlineDrivers(
      { lat: 6.335, lng: 5.627 },
      'keke' as any,
      5000,
      'Benin City',
    );

    expect(result).toEqual([]);
    const templateParts = queryRaw.mock.calls[0][0];
    const sql = templateParts.join('');
    expect(sql).toContain('city =');
    expect(queryRaw.mock.calls[0]).toContain('Benin City');
  });

  it('does NOT include city filter when city is undefined', async () => {
    const queryRaw = jest.fn().mockResolvedValue([{ id: 'd1', dist: 500 }]);
    const repo = makeRepo(queryRaw);

    await repo.findNearestOnlineDrivers(
      { lat: 9.0579, lng: 7.4951 },
      'keke' as any,
      5000,
    );

    const templateParts = queryRaw.mock.calls[0][0];
    const sql = templateParts.join('');
    expect(sql).not.toContain('city =');
  });

  it('does NOT include city filter when city is empty string', async () => {
    const queryRaw = jest.fn().mockResolvedValue([{ id: 'd1', dist: 500 }]);
    const repo = makeRepo(queryRaw);

    await repo.findNearestOnlineDrivers(
      { lat: 9.0579, lng: 7.4951 },
      'keke' as any,
      5000,
      '',
    );

    const templateParts = queryRaw.mock.calls[0][0];
    const sql = templateParts.join('');
    expect(sql).not.toContain('city =');
  });

  it('Benin City trip only queries for Benin City drivers', async () => {
    const queryRaw = jest.fn().mockResolvedValue([]);
    const repo = makeRepo(queryRaw);

    await repo.findNearestOnlineDrivers(
      { lat: 6.335, lng: 5.627 },
      'keke' as any,
      5000,
      'Benin City',
    );

    // City arg must be Benin City, not Abuja
    const args = queryRaw.mock.calls[0].slice(1);
    expect(args).toContain('Benin City');
    expect(args).not.toContain('Abuja');
  });

  it('Abuja trip only queries for Abuja drivers', async () => {
    const queryRaw = jest.fn().mockResolvedValue([]);
    const repo = makeRepo(queryRaw);

    await repo.findNearestOnlineDrivers(
      { lat: 9.0579, lng: 7.4951 },
      'keke' as any,
      5000,
      'Abuja',
    );

    const args = queryRaw.mock.calls[0].slice(1);
    expect(args).toContain('Abuja');
    expect(args).not.toContain('Benin City');
  });

  it('returns drivers when city matches', async () => {
    const queryRaw = jest.fn().mockResolvedValue([{ id: 'abuja-d1', dist: 500 }]);
    const repo = makeRepo(queryRaw);

    const result = await repo.findNearestOnlineDrivers(
      { lat: 9.0579, lng: 7.4951 },
      'keke' as any,
      5000,
      'Abuja',
    );

    expect(result).toEqual([{ id: 'abuja-d1', distanceMeters: 500 }]);
  });

  it('falls back to proximity-only when no city provided', async () => {
    const queryRaw = jest.fn().mockResolvedValue([
      { id: 'd1', dist: 500 },
      { id: 'd2', dist: 2000 },
    ]);
    const repo = makeRepo(queryRaw);

    const result = await repo.findNearestOnlineDrivers(
      { lat: 9.0579, lng: 7.4951 },
      'keke' as any,
      5000,
    );

    expect(result).toHaveLength(2);
    const templateParts = queryRaw.mock.calls[0][0];
    const sql = templateParts.join('');
    expect(sql).not.toContain('city =');
  });
});
