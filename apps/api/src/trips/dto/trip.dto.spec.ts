import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { PaymentMethod, VehicleType } from '@higo/shared-types';
import { RequestTripDto } from './trip.dto';

describe('RequestTripDto', () => {
  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: RequestTripDto,
    data: '',
  };

  it('accepts passenger booking coordinates shaped as lat/lng objects', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    });

    await expect(
      pipe.transform(
        {
          pickup: { lat: 9.0765, lng: 7.3986 },
          pickupAddress: 'Wuse Market',
          destination: { lat: 9.0579, lng: 7.4951 },
          destinationAddress: 'Jabi Lake Mall',
          vehicleType: VehicleType.KEKE,
          paymentMethod: PaymentMethod.CASH,
          isShared: false,
        },
        metadata,
      ),
    ).resolves.toMatchObject({
      pickup: { lat: 9.0765, lng: 7.3986 },
      destination: { lat: 9.0579, lng: 7.4951 },
    });
  });
});
