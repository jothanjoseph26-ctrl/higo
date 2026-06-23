import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { KycDocType } from '@higo/shared-types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(private readonly prisma: PrismaService) {}

  async logKycEvent(event: {
    driverId: string;
    docType?: KycDocType;
    action: string;
    actorId?: string;
    actorType?: 'driver' | 'admin' | 'system';
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.prisma.complianceAudit.create({
        data: {
          driverId: event.driverId,
          docType: event.docType,
          action: event.action,
          actorId: event.actorId,
          actorType: event.actorType,
          metadata: (event.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      this.logger.error(
        `Compliance log failed driver=${event.driverId} action=${event.action}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  async setOperatingZones(driverId: string, zoneIds: string[]): Promise<void> {
    await this.prisma.driver.update({
      where: { id: driverId },
      data: { operatingZoneIds: zoneIds },
    });

    await this.logKycEvent({
      driverId,
      action: 'zone_update',
      actorType: 'admin',
      metadata: { zoneIds },
    });
  }
}