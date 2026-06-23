import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AesService, EncryptedBlob } from '../common/crypto/aes.service';
import { PaystackClient } from './paystack/paystack.client';
import { FinancialAuditService } from './audit/financial-audit.service';
import { BankDetails, Kobo, WithdrawResponse, PaymentStatus, PaymentMethod } from '@higo/shared-types';
import { AppException } from '../common/errors/app.exception';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class DisbursementService {
  private readonly logger = new Logger(DisbursementService.name);
  private readonly commissionRate: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly aesService: AesService,
    private readonly paystack: PaystackClient,
    private readonly audit: FinancialAuditService,
    config: ConfigService,
  ) {
    this.commissionRate = Number(config.get<number>('PLATFORM_COMMISSION_RATE', 0.10));
  }

  /**
   * Encrypt bank details, store them in the driver record, and create a transfer recipient in Paystack.
   */
  async createRecipient(driverId: string, bank: BankDetails): Promise<string> {
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) {
      throw new AppException('NOT_FOUND', undefined, 'Driver not found');
    }

    // Encrypt bank details (NDPA compliance)
    const encryptedBlob = this.aesService.encrypt(JSON.stringify(bank));

    // Register with Paystack Transfer Recipient API
    const recipient = await this.paystack.createTransferRecipient(
      driver.name,
      bank.accountNumber,
      bank.bankCode,
    );

    // Save encrypted bank details and Paystack recipient code to DB
    await this.prisma.driver.update({
      where: { id: driverId },
      data: {
        bankDetailsEncrypted: encryptedBlob as any,
        paystackRecipientCode: recipient.recipient_code,
      },
    });

    await this.audit.logEvent({
      action: 'recipient.create',
      actorId: driverId,
      actorType: 'driver',
      reference: `rec_${driverId}_${Date.now()}`,
      metadata: { recipientCode: recipient.recipient_code },
    });

    return recipient.recipient_code;
  }

  /**
   * Calculate driver's available balance:
   * (Total net payout from released non-cash trips) - (Total successful or processing payouts).
   */
  async getAvailableBalance(driverId: string): Promise<Kobo> {
    // 1. Get all completed, released, non-cash trips for the driver
    const trips = await this.prisma.trip.findMany({
      where: {
        driverId,
        status: 'completed',
        paymentStatus: 'released',
        paymentMethod: {
          not: PaymentMethod.CASH,
        },
      },
      select: {
        totalFare: true,
      },
    });

    // Sum up the net earnings (gross minus platform commission)
    const totalEarned = trips.reduce((sum, trip) => {
      const netPayout = Math.round(trip.totalFare * (1 - this.commissionRate));
      return sum + netPayout;
    }, 0);

    // 2. Sum up all successful/processing withdrawals recorded in FinancialAudit logs
    const audits = await this.prisma.financialAudit.findMany({
      where: {
        actorId: driverId,
        actorType: 'driver',
        action: {
          in: ['transfer.success', 'transfer.create'],
        },
      },
      select: {
        amount: true,
        action: true,
        reference: true,
      },
    });

    // To prevent double counting if we log both transfer.create and transfer.success,
    // we track unique transfer references.
    const completedRefs = new Set<string>();
    const pendingTransfers = new Map<string, number>();

    for (const log of audits) {
      if (log.amount) {
        if (log.action === 'transfer.success') {
          completedRefs.add(log.reference);
        } else if (log.action === 'transfer.create') {
          pendingTransfers.set(log.reference, log.amount);
        }
      }
    }

    let totalWithdrawn = 0;
    // Add completed transfers
    for (const ref of completedRefs) {
      const amount = pendingTransfers.get(ref);
      if (amount) {
        totalWithdrawn += amount;
        pendingTransfers.delete(ref); // Remove from pending list
      }
    }
    // Add remaining pending transfers
    for (const amount of pendingTransfers.values()) {
      totalWithdrawn += amount;
    }

    return Math.max(0, totalEarned - totalWithdrawn);
  }

  /**
   * Idempotent payout / transfer request.
   */
  async withdraw(driverId: string, amount: Kobo): Promise<WithdrawResponse> {
    if (amount <= 0) {
      throw new AppException('VALIDATION_ERROR', undefined, 'Withdrawal amount must be greater than zero');
    }

    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) {
      throw new AppException('NOT_FOUND', undefined, 'Driver not found');
    }

    if (!driver.paystackRecipientCode) {
      throw new AppException('VALIDATION_ERROR', undefined, 'Driver has no registered bank account recipient');
    }

    // Verify driver has enough balance
    const available = await this.getAvailableBalance(driverId);
    if (amount > available) {
      throw new AppException('VALIDATION_ERROR', undefined, `Insufficient balance. Available: ${available} kobo`);
    }

    // Generate unique idempotent reference for the transfer
    const reference = uuidv4();

    // Log the initiation to prevent concurrency issues
    await this.audit.logEvent({
      action: 'transfer.create',
      actorId: driverId,
      actorType: 'driver',
      reference,
      amount,
      beforeStatus: 'pending',
      afterStatus: 'processing',
    });

    try {
      const transfer = await this.paystack.initiateTransfer(
        amount,
        driver.paystackRecipientCode,
        reference,
        'HiGo driver payout',
      );

      let status: WithdrawResponse['status'] = 'processing';
      if (transfer.status === 'success') {
        status = 'success';
        await this.audit.logEvent({
          action: 'transfer.success',
          actorId: driverId,
          actorType: 'driver',
          reference,
          amount,
          beforeStatus: 'processing',
          afterStatus: 'success',
        });
      } else if (transfer.status === 'failed') {
        throw new Error('Paystack transfer failed immediately');
      }

      return {
        transferReference: reference,
        amount,
        status,
      };
    } catch (err: any) {
      this.logger.error(`Withdrawal failed for driver=${driverId}: ${err.message}`, err.stack);
      await this.audit.logEvent({
        action: 'transfer.failed',
        actorId: driverId,
        actorType: 'driver',
        reference,
        amount,
        beforeStatus: 'processing',
        afterStatus: 'failed',
        metadata: { error: err.message },
      });
      throw new AppException('INTERNAL_ERROR', undefined, 'Withdrawal transfer could not be completed. Try again.');
    }
  }
}
