import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentService } from './payment.service';
import { FinancialAuditService } from './audit/financial-audit.service';
import { AppException } from '../common/errors/app.exception';
import { Kobo, PaymentMethod, PaymentStatus, TransactionEntry } from '@higo/shared-types';

const TRANSACTION_ACTION_MAP: Record<TransactionEntry['type'], string[]> = {
  charge: ['payment.initialize', 'charge.success'],
  transfer: ['transfer.success', 'transfer.failed'],
  subscription: ['subscription.create', 'subscription.expire'],
  refund: ['refund.processed'],
};

function mapActionToType(action: string): TransactionEntry['type'] {
  if (action.includes('refund')) return 'refund';
  if (action.includes('transfer')) return 'transfer';
  if (action.includes('subscription')) return 'subscription';
  return 'charge';
}

function mapAuditRow(row: {
  reference: string;
  action: string;
  amount: number | null;
  afterStatus: string | null;
  metadata: unknown;
  createdAt: Date;
}): TransactionEntry {
  const metadata = (row.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as {
    tripId?: string;
    paymentMethod?: PaymentMethod;
  };

  return {
    reference: row.reference,
    tripId: metadata.tripId ?? null,
    type: mapActionToType(row.action),
    amount: row.amount ?? 0,
    status: (row.afterStatus as TransactionEntry['status']) ?? PaymentStatus.PENDING,
    method: metadata.paymentMethod ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface RefundEligibleItem {
  tripId: string;
  paystackReference: string;
  totalFare: Kobo;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod | null;
  passengerId: string;
  passengerName: string | null;
  passengerPhone: string;
  tripStatus: string;
  completedAt: string | null;
  createdAt: string;
}

@Injectable()
export class AdminFinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
    private readonly audit: FinancialAuditService,
  ) {}

  async listTransactions(
    limit: number,
    offset: number,
    type?: TransactionEntry['type'],
    status?: string,
  ) {
    const where: { action?: { in: string[] }; afterStatus?: string } = {};

    if (type && TRANSACTION_ACTION_MAP[type]) {
      where.action = { in: TRANSACTION_ACTION_MAP[type] };
    }

    if (status) {
      where.afterStatus = status;
    }

    const [rows, total] = await Promise.all([
      this.prisma.financialAudit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.financialAudit.count({ where }),
    ]);

    return {
      transactions: rows.map(mapAuditRow),
      total,
      limit,
      offset,
    };
  }

  async listRefundEligible(limit: number, offset: number) {
    const where = {
      paystackReference: { not: null },
      paymentStatus: { in: [PaymentStatus.HELD, PaymentStatus.RELEASED] as const },
    };

    const [trips, total] = await Promise.all([
      this.prisma.trip.findMany({
        where,
        include: {
          passenger: {
            select: { id: true, name: true, phone: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.trip.count({ where }),
    ]);

    const items: RefundEligibleItem[] = trips
      .filter((trip) => trip.paystackReference)
      .map((trip) => ({
        tripId: trip.id,
        paystackReference: trip.paystackReference!,
        totalFare: trip.totalFare,
        paymentStatus: trip.paymentStatus as PaymentStatus,
        paymentMethod: trip.paymentMethod as PaymentMethod | null,
        passengerId: trip.passengerId,
        passengerName: trip.passenger.name,
        passengerPhone: trip.passenger.phone,
        tripStatus: trip.status,
        completedAt: trip.completedAt ? trip.completedAt.toISOString() : null,
        createdAt: trip.createdAt.toISOString(),
      }));

    return { items, total, limit, offset };
  }

  async processRefund(
    adminId: string,
    dto: { reference: string; amount?: Kobo; reason?: string },
  ) {
    const trip = await this.prisma.trip.findUnique({
      where: { paystackReference: dto.reference },
    });

    if (!trip) {
      throw new AppException('NOT_FOUND', undefined, 'Trip with this payment reference not found');
    }

    if (trip.paymentStatus === PaymentStatus.REFUNDED) {
      throw new AppException('VALIDATION_ERROR', undefined, 'This payment has already been refunded');
    }

    if (![PaymentStatus.HELD, PaymentStatus.RELEASED].includes(trip.paymentStatus as PaymentStatus)) {
      throw new AppException(
        'VALIDATION_ERROR',
        undefined,
        `Payment status "${trip.paymentStatus}" is not eligible for refund`,
      );
    }

    if (dto.amount !== undefined && (dto.amount <= 0 || dto.amount > trip.totalFare)) {
      throw new AppException(
        'VALIDATION_ERROR',
        undefined,
        'Refund amount must be greater than zero and not exceed trip fare',
      );
    }

    const result = await this.paymentService.refund(dto.reference, dto.amount, {
      actorId: adminId,
      actorType: 'admin',
    });

    await this.audit.logEvent({
      action: 'admin.refund',
      actorId: adminId,
      actorType: 'admin',
      reference: dto.reference,
      amount: dto.amount ?? trip.totalFare,
      beforeStatus: trip.paymentStatus,
      afterStatus: PaymentStatus.REFUNDED,
      metadata: {
        tripId: trip.id,
        refundReference: result.refundReference,
        reason: dto.reason ?? null,
      },
    });

    return {
      tripId: trip.id,
      reference: dto.reference,
      refundReference: result.refundReference,
      amount: dto.amount ?? trip.totalFare,
      paymentStatus: PaymentStatus.REFUNDED,
    };
  }

  async listComplaints(limit: number, offset: number, status?: string) {
    const where: {
      raisedBy: 'passenger';
      status?: string | { in: string[] };
    } = {
      raisedBy: 'passenger',
    };

    if (status) {
      where.status = status;
    } else {
      where.status = { in: ['open', 'investigating'] };
    }

    const [complaints, total] = await Promise.all([
      this.prisma.dispute.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.dispute.count({ where }),
    ]);

    return { complaints, total, limit, offset };
  }
}