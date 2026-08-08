import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const SETTINGS_ID = 'default';

const DEFAULT_MATCH = {
  radiusMeters: 5000,
  offerTimeoutSec: 15,
  ctsWeights: {
    ninVerifiedPoints: 25,
    trips100Points: 10,
    trips500Points: 20,
    trips1000Points: 30,
    ratingAbove48Points: 20,
    estateEndorsementPoints: 15,
    referralApprovedPoints: 10,
  },
};

const DEFAULT_COMMISSION = { ratePct: 10 };

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function parseMatchSettings(raw: unknown) {
  const d = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const w = d.ctsWeights && typeof d.ctsWeights === 'object' ? (d.ctsWeights as Record<string, unknown>) : {};
  const defaults = DEFAULT_MATCH;
  return {
    radiusMeters: num(d.radiusMeters, defaults.radiusMeters),
    offerTimeoutSec: num(d.offerTimeoutSec, defaults.offerTimeoutSec),
    ctsWeights: {
      ninVerifiedPoints: num(w.ninVerifiedPoints, defaults.ctsWeights.ninVerifiedPoints),
      trips100Points: num(w.trips100Points, defaults.ctsWeights.trips100Points),
      trips500Points: num(w.trips500Points, defaults.ctsWeights.trips500Points),
      trips1000Points: num(w.trips1000Points, defaults.ctsWeights.trips1000Points),
      ratingAbove48Points: num(w.ratingAbove48Points, defaults.ctsWeights.ratingAbove48Points),
      estateEndorsementPoints: num(w.estateEndorsementPoints, defaults.ctsWeights.estateEndorsementPoints),
      referralApprovedPoints: num(w.referralApprovedPoints, defaults.ctsWeights.referralApprovedPoints),
    },
  };
}

function parseCommissionSettings(raw: unknown) {
  const d = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    ratePct: num(d.ratePct, DEFAULT_COMMISSION.ratePct),
  };
}

export interface MatchSettings {
  radiusMeters: number;
  offerTimeoutSec: number;
  ctsWeights: {
    ninVerifiedPoints: number;
    trips100Points: number;
    trips500Points: number;
    trips1000Points: number;
    ratingAbove48Points: number;
    estateEndorsementPoints: number;
    referralApprovedPoints: number;
  };
}

export interface CommissionSettings {
  ratePct: number;
}

/**
 * Reads platform_settings from DB with a short in-memory TTL cache.
 * The matching engine, CTS, and admin controller all need these values.
 * Avoids repeated DB hits on every dispatch — cache expires after 60s.
 */
@Injectable()
export class PlatformSettingsReader implements OnModuleInit {
  private readonly logger = new Logger(PlatformSettingsReader.name);
  private cached: { match: MatchSettings; commission: CommissionSettings } | null = null;
  private cacheExpiresAt = 0;
  private readonly CACHE_TTL_MS = 60_000;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.refresh();
  }

  private async refresh() {
    try {
      const row = await this.prisma.platformSettings.findUnique({
        where: { id: SETTINGS_ID },
      });
      const settings = (row?.settings as Record<string, unknown>) ?? {};
      this.cached = {
        match: parseMatchSettings(settings.match),
        commission: parseCommissionSettings(settings.commission),
      };
      this.cacheExpiresAt = Date.now() + this.CACHE_TTL_MS;
    } catch (err) {
      this.logger.warn(`Failed to load platform settings, using defaults: ${err}`);
      this.cached = {
        match: { ...DEFAULT_MATCH },
        commission: { ...DEFAULT_COMMISSION },
      };
      this.cacheExpiresAt = Date.now() + this.CACHE_TTL_MS;
    }
  }

  async getMatchSettings(): Promise<MatchSettings> {
    if (!this.cached || Date.now() > this.cacheExpiresAt) {
      await this.refresh();
    }
    return this.cached!.match;
  }

  async getCommissionSettings(): Promise<CommissionSettings> {
    if (!this.cached || Date.now() > this.cacheExpiresAt) {
      await this.refresh();
    }
    return this.cached!.commission;
  }

  /** Force-refresh (e.g. after PUT /admin/settings) */
  invalidate() {
    this.cached = null;
    this.cacheExpiresAt = 0;
  }
}
