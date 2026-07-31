import { PaymentMethod } from '@higo/shared-types';
import { DeliveriesService } from './deliveries.service';

describe('DeliveriesService', () => {
  it('creates a delivery and matches an available bike rider', async () => {
    const now = new Date('2026-07-28T12:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);

    const deliveryRow = {
      id: 'delivery-1',
      senderId: 'passenger-1',
      senderName: 'Ada',
      senderPhone: '+2348000000000',
      city: 'Abuja',
      pickupGeoJson: JSON.stringify({ type: 'Point', coordinates: [7.4, 9.0] }),
      pickupAddress: 'Apo',
      dropoffGeoJson: JSON.stringify({ type: 'Point', coordinates: [7.45, 9.02] }),
      dropoffAddress: 'Wuse',
      recipientName: 'Tunde',
      recipientPhone: '+2348111111111',
      parcelSize: 'small',
      parcelDescription: 'Documents',
      parcelPhotoUrl: null,
      vehicleType: 'bike',
      status: 'accepted',
      riderId: 'driver-1',
      riderName: 'Rider One',
      riderPhone: '+2348222222222',
      riderPlate: 'ABC-123',
      riderAvatar: null,
      estimatedFare: 105000,
      totalFare: 105000,
      distanceKm: 5.97,
      durationMin: 18,
      paymentMethod: 'cash',
      paymentStatus: 'pending',
      deliveryPhotoUrl: null,
      recipientVerified: false,
      trackingGeoJson: null,
      acceptedAt: now,
      pickedUpAt: null,
      deliveredAt: null,
      cancelledAt: null,
      cancelReason: null,
      description: null,
      createdAt: now,
      updatedAt: now,
    };

    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'passenger-1',
          name: 'Ada',
          phone: '+2348000000000',
        }),
      },
      driver: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'driver-1',
          name: 'Rider One',
          phone: '+2348222222222',
          vehiclePlate: 'ABC-123',
          avatarUrl: null,
          ratingAvg: 4.8,
        }),
      },
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'delivery-1' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([deliveryRow]),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const geo = {
      findNearestOnlineDrivers: jest.fn().mockResolvedValue([
        { id: 'driver-1', distanceMeters: 1200 },
      ]),
    };
    const service = new DeliveriesService(prisma as any, geo as any);

    const result = await service.requestDelivery('passenger-1', {
      pickup: { lat: 9.0, lng: 7.4 },
      pickupAddress: 'Apo',
      dropoff: { lat: 9.02, lng: 7.45 },
      dropoffAddress: 'Wuse',
      recipientName: 'Tunde',
      recipientPhone: '+2348111111111',
      parcelDescription: 'Documents',
      paymentMethod: PaymentMethod.CASH,
    });

    expect(result.match.outcome).toBe('MATCHED');
    expect(result.delivery?.status).toBe('accepted');
    expect(result.delivery?.riderId).toBe('driver-1');
    expect(geo.findNearestOnlineDrivers).toHaveBeenCalledWith(
      { lat: 9.0, lng: 7.4 },
      'bike',
      5000,
    );

    jest.useRealTimers();
  });
});
