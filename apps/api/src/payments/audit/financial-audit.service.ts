import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Kobo } from '@higo/shared-types';

export interface AuditLogDto {
  action: string;
  actorId?: string;
  actorType?: 'passenger' | 'driver' | 'admin';
  reference: string;
  amount?: Kobo;
  beforeStatus?: string;
  afterStatus?: string;
  metadata?: any;
}

@Injectable()
export class FinancialAuditService {
  private readonly logger = new Logger(FinancialAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async logEvent(dto: AuditLogDto): Promise<void> {
    try {
      await this.prisma.financialAudit.create({
        data: {
          action: dto.action,
          actorId: dto.actorId,
          actorType: dto.actorType,
          reference: dto.reference,
          amount: dto.amount,
          beforeStatus: dto.beforeStatus,
          afterStatus: dto.afterStatus,
          metadata: dto.metadata || {},
        },
      });
      this.logger.log(`Financial Audit Logged: ${dto.action} | ref=${dto.reference}`);
    } catch (err: any) {
      this.logger.error(
        `Failed to write financial audit log for ref=${dto.reference}: ${err.message}`,
        err.stack,
      );
      // We do NOT rethrow if it fails. We want payment flows to proceed even if auditing has an issue,
      // though in production we might want to fail or raise an alert. Let's log it heavily.
    }
  }
}
