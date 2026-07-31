import { AutoCancelRidesService } from './auto-cancel-rides.service';

describe('AutoCancelRidesService', () => {
  it('cancels requested and matched trips stuck past their timeout', async () => {
    const prisma = {
      trip: {
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 2 }),
      },
    };
    const service = new AutoCancelRidesService(prisma as any);
    const now = new Date('2026-07-28T12:00:00.000Z');

    await expect(service.cancelStuckTrips(now)).resolves.toEqual({
      cancelled: 3,
      timestamp: '2026-07-28T12:00:00.000Z',
    });

    expect(prisma.trip.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        status: 'requested',
        isScheduled: false,
        createdAt: { lt: new Date('2026-07-28T11:55:00.000Z') },
      },
      data: {
        status: 'cancelled',
        cancelledAt: now,
        cancelReason: 'Auto-cancelled: no driver found within 5 minutes',
      },
    });
    expect(prisma.trip.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        status: 'matched',
        createdAt: { lt: new Date('2026-07-28T11:50:00.000Z') },
      },
      data: {
        status: 'cancelled',
        cancelledAt: now,
        cancelReason: 'Auto-cancelled: driver did not proceed within 10 minutes',
      },
    });
  });
});
