import { Test, TestingModule } from '@nestjs/testing';
import { DisbursementService } from './disbursement.service';
import { PrismaService } from '../prisma/prisma.service';
import { AesService } from '../common/crypto/aes.service';
import { PaystackClient } from './paystack/paystack.client';
import { FinancialAuditService } from './audit/financial-audit.service';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../common/errors/app.exception';
import { PaymentMethod } from '@higo/shared-types';

describe('DisbursementService', () => {
  let service: DisbursementService;
  let prisma: any;
  let paystack: any;
  let aesService: any;
  let audit: any;

  beforeEach(async () => {
    prisma = {
      trip: {
        findMany: jest.fn(),
      },
      driver: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      financialAudit: {
        findMany: jest.fn(),
      },
    };

    paystack = {
      createTransferRecipient: jest.fn(),
      initiateTransfer: jest.fn(),
    };

    aesService = {
      encrypt: jest.fn(() => ({ iv: 'iv', tag: 'tag', ciphertext: 'ciphertext' })),
      decrypt: jest.fn(() => '{}'),
    };

    audit = {
      logEvent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DisbursementService,
        { provide: PrismaService, useValue: prisma },
        { provide: AesService, useValue: aesService },
        { provide: PaystackClient, useValue: paystack },
        { provide: FinancialAuditService, useValue: audit },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              if (key === 'PLATFORM_COMMISSION_RATE') return 0.10; // 10%
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<DisbursementService>(DisbursementService);
  });

  describe('Commission and Earnings Math', () => {
    it('should correctly calculate available balance with 10% commission rate', async () => {
      const driverId = 'driver-uuid';

      // Mock two completed, released, non-cash trips:
      // Trip 1: gross = 5000 kobo (N50). Net = round(5000 * 0.90) = 4500
      // Trip 2: gross = 10000 kobo (N100). Net = round(10000 * 0.90) = 9000
      // Total Net earned = 13500 kobo
      prisma.trip.findMany.mockResolvedValue([
        { totalFare: 5000 },
        { totalFare: 10000 },
      ]);

      // Mock previous audit logs:
      // One successful withdrawal of 4000 kobo
      // One pending withdrawal of 2000 kobo (should be deducted too to prevent double-spending)
      // Total withdrawn = 6000 kobo
      prisma.financialAudit.findMany.mockResolvedValue([
        { amount: 4000, action: 'transfer.success', reference: 'ref_1' },
        { amount: 4000, action: 'transfer.create', reference: 'ref_1' }, // success duplicate ref (should not double count)
        { amount: 2000, action: 'transfer.create', reference: 'ref_2' }, // pending
      ]);

      // Expected available = 13500 - (4000 + 2000) = 7500 kobo
      const balance = await service.getAvailableBalance(driverId);
      expect(balance).toBe(7500);
    });

    it('should throw if withdrawal request exceeds available balance', async () => {
      const driverId = 'driver-uuid';
      prisma.driver.findUnique.mockResolvedValue({
        id: driverId,
        paystackRecipientCode: 'RCP_123',
      });

      // Earned = 9000, Withdrawn = 0 -> Available = 9000
      prisma.trip.findMany.mockResolvedValue([{ totalFare: 10000 }]);
      prisma.financialAudit.findMany.mockResolvedValue([]);

      // Request withdrawal of 10000 (more than 9000)
      await expect(
        service.withdraw(driverId, 10000),
      ).rejects.toThrow(AppException);
    });
  });
});
