import { Test, TestingModule } from '@nestjs/testing';
import { PaymentService } from './payment.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PaystackClient } from './paystack/paystack.client';
import { FinancialAuditService } from './audit/financial-audit.service';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';

describe('PaymentService', () => {
  let service: PaymentService;
  let prisma: any;
  let redis: any;
  let paystack: any;
  let audit: any;

  const mockSecret = 'test_paystack_secret_key_long_enough_for_hmac_32_chars';

  beforeEach(async () => {
    prisma = {
      trip: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      driver: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      subscription: {
        create: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    redis = {
      get: jest.fn(),
      setNx: jest.fn(),
    };

    paystack = {
      initializeTransaction: jest.fn(),
      refundTransaction: jest.fn(),
    };

    audit = {
      logEvent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: PaystackClient, useValue: paystack },
        { provide: FinancialAuditService, useValue: audit },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string) => {
              if (key === 'PAYSTACK_SECRET_KEY') return mockSecret;
              if (key === 'APP_PAYMENT_CALLBACK_URL') return 'http://callback';
              return '';
            }),
            get: jest.fn((key: string) => ''),
          },
        },
      ],
    }).compile();

    service = module.get<PaymentService>(PaymentService);
  });

  describe('Webhook Signature Verification', () => {
    it('should throw UnauthorizedException if signature is missing', async () => {
      await expect(
        service.handleWebhook(Buffer.from('{}'), ''),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if signature does not match', async () => {
      await expect(
        service.handleWebhook(Buffer.from('{}'), 'wrong_signature'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should verify and return received: true if signature matches and event is new', async () => {
      const rawBody = Buffer.from(JSON.stringify({ event: 'charge.success', data: { reference: 'ref_123' } }));
      const correctSignature = createHmac('sha512', mockSecret)
        .update(rawBody)
        .digest('hex');

      redis.setNx.mockResolvedValue(true); // new webhook

      const result = await service.handleWebhook(rawBody, correctSignature);
      expect(result).toEqual({ received: true });
      expect(redis.setNx).toHaveBeenCalledWith('webhook:ref_123:charge.success', '1', 604800);
    });

    it('should return received: true without reprocessing if event was already processed', async () => {
      const rawBody = Buffer.from(JSON.stringify({ event: 'charge.success', data: { reference: 'ref_123' } }));
      const correctSignature = createHmac('sha512', mockSecret)
        .update(rawBody)
        .digest('hex');

      redis.setNx.mockResolvedValue(false); // duplicate webhook

      const result = await service.handleWebhook(rawBody, correctSignature);
      expect(result).toEqual({ received: true });
    });
  });

  describe('Logical Escrow Release', () => {
    it('should update trip paymentStatus to released if currently held', async () => {
      const tripId = 'trip-uuid';
      prisma.trip.findUnique.mockResolvedValue({
        id: tripId,
        paymentStatus: 'held',
        totalFare: 5000,
        paystackReference: 'ref_123',
        driverId: 'driver-uuid',
      });

      await service.releaseEscrow(tripId);

      expect(prisma.trip.update).toHaveBeenCalledWith({
        where: { id: tripId },
        data: { paymentStatus: 'released' },
      });
      expect(audit.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'escrow.release',
          beforeStatus: 'held',
          afterStatus: 'released',
        }),
      );
    });

    it('should not release escrow if trip paymentStatus is not HELD', async () => {
      const tripId = 'trip-uuid';
      prisma.trip.findUnique.mockResolvedValue({
        id: tripId,
        paymentStatus: 'pending',
      });

      await service.releaseEscrow(tripId);

      expect(prisma.trip.update).not.toHaveBeenCalled();
    });
  });
});
