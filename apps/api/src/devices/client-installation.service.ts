import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AuthUser } from '../common/types/auth-user';

const RECORD_THROTTLE_SECONDS = 300;

export interface ClientTelemetry {
  installationId: string;
  clientType: string;
  devicePlatform: string;
  appVersion?: string;
  buildNumber?: string;
  installSource: string;
}

@Injectable()
export class ClientInstallationService {
  private readonly logger = new Logger(ClientInstallationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async record(user: AuthUser, telemetry: ClientTelemetry): Promise<void> {
    try {
      const key = `client-telem:${user.type}:${user.sub}:${telemetry.installationId}`;
      const acquired = await this.redis.setNx(
        key,
        '1',
        RECORD_THROTTLE_SECONDS,
      );
      if (!acquired) return;

      const now = new Date();
      const data = {
        userId: user.sub,
        role: user.type,
        installationId: telemetry.installationId,
        clientType: telemetry.clientType,
        devicePlatform: telemetry.devicePlatform,
        appVersion: telemetry.appVersion,
        buildNumber: telemetry.buildNumber,
        installSource: telemetry.installSource,
        lastSeenAt: now,
      };

      const existing = await this.prisma.clientInstallation.findUnique({
        where: {
          userId_installationId: {
            userId: user.sub,
            installationId: telemetry.installationId,
          },
        },
      });

      if (!existing) {
        await this.prisma.clientInstallation.create({ data });
        return;
      }

      const update: Record<string, unknown> = {
        lastSeenAt: now,
        role: user.type,
        clientType: telemetry.clientType,
        devicePlatform: telemetry.devicePlatform,
      };
      if (telemetry.appVersion) update.appVersion = telemetry.appVersion;
      if (telemetry.buildNumber) update.buildNumber = telemetry.buildNumber;
      // Never downgrade a known install source to UNKNOWN via headers.
      if (telemetry.installSource !== 'UNKNOWN') {
        update.installSource = telemetry.installSource;
      }

      await this.prisma.clientInstallation.update({
        where: { id: existing.id },
        data: update,
      });
    } catch (err) {
      this.logger.debug(
        `client installation record failed user=${user.sub}: ${(err as Error).message}`,
      );
    }
  }

  async submitIntegrityResult(
    user: AuthUser,
    installationId: string,
    result: {
      verified: boolean;
      installSource: string;
      installerPackage?: string;
      reason: string;
      appVersion?: string;
      buildNumber?: string;
      clientType?: string;
      devicePlatform?: string;
    },
  ): Promise<void> {
    try {
      const now = new Date();
      const existing = await this.prisma.clientInstallation.findUnique({
        where: {
          userId_installationId: {
            userId: user.sub,
            installationId,
          },
        },
      });

      const data = {
        userId: user.sub,
        role: user.type,
        installationId,
        integrityVerified: result.verified,
        integrityVerifiedAt: result.verified ? now : null,
        integrityReason: result.reason,
        installerPackage: result.installerPackage,
        lastSeenAt: now,
        ...(result.installSource !== 'UNKNOWN'
          ? { installSource: result.installSource }
          : {}),
        ...(result.appVersion ? { appVersion: result.appVersion } : {}),
        ...(result.buildNumber ? { buildNumber: result.buildNumber } : {}),
        ...(result.clientType ? { clientType: result.clientType } : {}),
        ...(result.devicePlatform
          ? { devicePlatform: result.devicePlatform }
          : {}),
      };

      if (!existing) {
        await this.prisma.clientInstallation.create({
          data: {
            ...data,
            clientType: result.clientType ?? 'UNKNOWN',
            devicePlatform: result.devicePlatform ?? 'UNKNOWN',
            installSource:
              result.installSource !== 'UNKNOWN'
                ? result.installSource
                : 'UNKNOWN',
          },
        });
        return;
      }

      const update: Record<string, unknown> = {
        lastSeenAt: now,
        integrityVerified: result.verified,
        integrityVerifiedAt: result.verified ? now : null,
        integrityReason: result.reason,
      };
      if (result.installerPackage !== undefined) {
        update.installerPackage = result.installerPackage;
      }
      if (result.installSource !== 'UNKNOWN') {
        update.installSource = result.installSource;
      }
      if (result.appVersion) update.appVersion = result.appVersion;
      if (result.buildNumber) update.buildNumber = result.buildNumber;
      if (result.clientType) update.clientType = result.clientType;
      if (result.devicePlatform) update.devicePlatform = result.devicePlatform;

      await this.prisma.clientInstallation.update({
        where: { id: existing.id },
        data: update,
      });
    } catch (err) {
      this.logger.debug(
        `integrity result record failed user=${user.sub}: ${(err as Error).message}`,
      );
    }
  }

  async listMine(user: AuthUser) {
    return this.prisma.clientInstallation.findMany({
      where: { userId: user.sub },
      orderBy: { lastSeenAt: 'desc' },
      select: {
        id: true,
        installationId: true,
        clientType: true,
        devicePlatform: true,
        appVersion: true,
        buildNumber: true,
        installSource: true,
        installerPackage: true,
        integrityVerified: true,
        integrityVerifiedAt: true,
        integrityReason: true,
        lastSeenAt: true,
        createdAt: true,
      },
    });
  }

  async listForUser(
    userId: string,
    filters?: { role?: string; installationId?: string },
  ) {
    return this.prisma.clientInstallation.findMany({
      where: {
        userId,
        ...(filters?.role ? { role: filters.role } : {}),
        ...(filters?.installationId
          ? { installationId: filters.installationId }
          : {}),
      },
      orderBy: { lastSeenAt: 'desc' },
      select: {
        id: true,
        installationId: true,
        role: true,
        clientType: true,
        devicePlatform: true,
        appVersion: true,
        buildNumber: true,
        installSource: true,
        installerPackage: true,
        integrityVerified: true,
        integrityVerifiedAt: true,
        integrityReason: true,
        lastSeenAt: true,
        createdAt: true,
      },
    });
  }
}
