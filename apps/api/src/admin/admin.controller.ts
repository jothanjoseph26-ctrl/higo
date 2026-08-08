import { Controller, Get, Post, Put, Delete, Body, Query, Param } from '@nestjs/common';
import { IsOptional, IsString, IsBoolean, IsEnum, IsNumber, Min, Max } from 'class-validator';
import {
  AdminGetWeeklyKpisHistoryResponse,
  AdminGetWeeklyKpisResponse,
} from '@higo/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { WeeklyKpiService } from '../jobs/weekly-kpi.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UseGuards } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception';
import { DEFAULT_HCE_CONFIG } from '../hce/hce-defaults';
import { HceRoutingConfig } from '../hce/hce.types';
import { parseHceConfig } from '../hce/hce-settings.service';
import { HceUsageService } from '../hce/hce-usage.service';
import { AiService } from '../ai/ai.service';
import { EmailService } from '../email/email.service';
import { OtpService } from '../auth/otp.service';
import { PlatformSettingsReader } from './platform-settings-reader.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../common/types/auth-user';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

// ─── Admin-only DTOs ─────────────────────────────────────────────────────────

/** Allowlist of fields an admin can update on a driver profile. */
export class UpdateDriverDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  vehiclePlate?: string;

  @IsOptional()
  @IsString()
  vehicleType?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isOnline?: boolean;

  @IsOptional()
  @IsString()
  @IsEnum(['pending', 'under_review', 'approved', 'rejected'] as const)
  kycStatus?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  ratingAvg?: number;
}

/** Validate zone boundary coordinates are real numbers (prevents SQL injection). */
export class CreateZoneDto {
  @IsString()
  name!: string;

  @IsString()
  zoneType!: string;

  boundary!: Array<{ lat: number; lng: number }>;

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(10)
  surgeMultiplier?: number;
}

const PLATFORM_SETTINGS_ID = 'default';

const DEFAULT_PLATFORM_SETTINGS = {
  googleMapsOriginRestriction: 'https://www.hiconnectgo.com/*',
  smsGatewayChannel: 'termii' as const,
  fcmServerKey: '',
  maintenanceMode: false,
  hce: DEFAULT_HCE_CONFIG,
  negotiation: {
    isEnabled: true,
    maxRounds: 3,
    maxTimeSec: 60,
    saveMorePct: 12,
    priorityPickupPct: 10,
    minFare: 20000,
    maxFare: 1000000,
  },
  referral: {
    commissionPct: 15,
    staffCommissionPct: 20,
    referredDriverReward: 0,
    minCashoutAmount: 100000,
    triggerEvent: 'subscription_paid' as 'subscription_paid' | 'first_trip_completed',
    isActive: true,
  },
  // Admin Studio (Track 06) instant-edit config sections — see
  // architecture/agent-instructions/base44-migration/06-admin-studio-control-panel.md
  commission: {
    ratePct: 10, // ADR "Year 1 10%" pattern
    effectiveDate: '2026-01-01',
    nextRatePct: 12 as number | null, // ADR "Year 2+ 12%" pattern
    nextEffectiveDate: null as string | null,
  },
  // NOTE: radiusMeters/offerTimeoutSec/ctsWeights mirror the current hardcoded
  // values in geo.repository.ts / matching.service.ts / cts.service.ts, but
  // are NOT yet read by that matching code (store + UI only — wiring a live
  // read path is Track 01/03's call per BASE44_MIGRATION_PLAN.md §4, mapping.md §2).
  match: {
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
  },
  // Gateway/method toggles only — never store live secret keys here
  // (see mapping.md §"CommissionConfig, MatchConfig, PaymentConfig..." item 10).
  payment: {
    paystackEnabled: true,
    paystackTestMode: true,
    cashEnabled: true,
    ussdEnabled: true,
    bankTransferEnabled: false,
  },
  promoDefaults: {
    discountType: 'percent' as 'percent' | 'fixed',
    discountValue: 10,
    maxUses: null as number | null,
    expiryDays: 30,
  },
  zoneEditor: {
    defaultSurgeMultiplier: 1.0,
    availableZoneTypes: ['permitted', 'restricted', 'surge'] as string[],
  },
  kycThresholds: {
    reviewSlaHours: 48,
    requireEstateEndorsement: false,
    fastTrackVerificationTier: 'tier_2' as 'tier_0' | 'tier_1' | 'tier_2' | 'tier_3',
  },
  banners: {
    items: [] as Array<{
      id: string;
      message: string;
      level: 'info' | 'warning' | 'critical';
      isActive: boolean;
      startAt: string | null;
      endAt: string | null;
    }>,
  },
  faq: {
    items: [] as Array<{
      id: string;
      question: string;
      answer: string;
      category: string;
      order: number;
    }>,
  },
  appCopy: {
    welcomeMessage: 'Welcome to HiGO',
    supportEmail: 'support@hiconnectgo.com',
    aboutText: '',
  } as Record<string, string>,
  featureFlags: {
    fareNegotiation: true,
    sharedRides: true,
    deliveries: true,
    loyaltyProgram: true,
  } as Record<string, boolean>,
  driverTraining: {
    items: [] as Array<{ id: string; title: string; content: string; order: number }>,
  },
  termsPolicy: {
    termsText: '',
    privacyText: '',
    version: '1.0',
    lastUpdated: null as string | null,
  },
  onboardingCopy: {
    steps: [] as Array<{ id: string; title: string; body: string; order: number }>,
  },
};

type NegotiationSettings = typeof DEFAULT_PLATFORM_SETTINGS.negotiation;
type ReferralSettings = typeof DEFAULT_PLATFORM_SETTINGS.referral;
type CommissionSettings = typeof DEFAULT_PLATFORM_SETTINGS.commission;
type MatchSettings = typeof DEFAULT_PLATFORM_SETTINGS.match;
type PaymentSettings = typeof DEFAULT_PLATFORM_SETTINGS.payment;
type PromoDefaultsSettings = typeof DEFAULT_PLATFORM_SETTINGS.promoDefaults;
type ZoneEditorSettings = typeof DEFAULT_PLATFORM_SETTINGS.zoneEditor;
type KycThresholdsSettings = typeof DEFAULT_PLATFORM_SETTINGS.kycThresholds;
type BannersSettings = typeof DEFAULT_PLATFORM_SETTINGS.banners;
type FaqSettings = typeof DEFAULT_PLATFORM_SETTINGS.faq;
type DriverTrainingSettings = typeof DEFAULT_PLATFORM_SETTINGS.driverTraining;
type TermsPolicySettings = typeof DEFAULT_PLATFORM_SETTINGS.termsPolicy;
type OnboardingCopySettings = typeof DEFAULT_PLATFORM_SETTINGS.onboardingCopy;

type PlatformSettingsPayload = {
  googleMapsOriginRestriction: string;
  smsGatewayChannel: 'termii' | 'africastalking';
  fcmServerKey: string;
  maintenanceMode: boolean;
  hce: HceRoutingConfig;
  negotiation: NegotiationSettings;
  referral: ReferralSettings;
  commission: CommissionSettings;
  match: MatchSettings;
  payment: PaymentSettings;
  promoDefaults: PromoDefaultsSettings;
  zoneEditor: ZoneEditorSettings;
  kycThresholds: KycThresholdsSettings;
  banners: BannersSettings;
  faq: FaqSettings;
  appCopy: Record<string, string>;
  featureFlags: Record<string, boolean>;
  driverTraining: DriverTrainingSettings;
  termsPolicy: TermsPolicySettings;
  onboardingCopy: OnboardingCopySettings;
};

// Categories that only a super_admin may write — money, matching, compliance
// and platform-security-adjacent config. Everything else (copy/content
// categories) is writable by 'admin' too. See DoD item on RBAC in
// 06-admin-studio-control-panel.md and Plan §4.2's instant-edit boundary.
const SUPER_ADMIN_ONLY_SETTINGS_KEYS = new Set<keyof PlatformSettingsPayload>([
  'googleMapsOriginRestriction',
  'smsGatewayChannel',
  'fcmServerKey',
  'maintenanceMode',
  'hce',
  'negotiation',
  'referral',
  'commission',
  'match',
  'payment',
  'promoDefaults',
  'zoneEditor',
  'kycThresholds',
]);

const FCM_KEY_MASK = '••••••••••••••••••••••••••••••••';

function parsePlatformSettings(raw: unknown): PlatformSettingsPayload {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Partial<PlatformSettingsPayload>;
  return {
    googleMapsOriginRestriction:
      typeof data.googleMapsOriginRestriction === 'string'
        ? data.googleMapsOriginRestriction
        : DEFAULT_PLATFORM_SETTINGS.googleMapsOriginRestriction,
    smsGatewayChannel:
      data.smsGatewayChannel === 'africastalking' ? 'africastalking' : 'termii',
    fcmServerKey: typeof data.fcmServerKey === 'string' ? data.fcmServerKey : '',
    maintenanceMode: Boolean(data.maintenanceMode),
    hce: parseHceConfig((data as any).hce),
    negotiation: parseNegotiationSettings((data as any).negotiation),
    referral: parseReferralSettings((data as any).referral),
    commission: parseCommissionSettings((data as any).commission),
    match: parseMatchSettings((data as any).match),
    payment: parsePaymentSettings((data as any).payment),
    promoDefaults: parsePromoDefaults((data as any).promoDefaults),
    zoneEditor: parseZoneEditorSettings((data as any).zoneEditor),
    kycThresholds: parseKycThresholds((data as any).kycThresholds),
    banners: parseBanners((data as any).banners),
    faq: parseFaq((data as any).faq),
    appCopy: parseStringRecord((data as any).appCopy, DEFAULT_PLATFORM_SETTINGS.appCopy),
    featureFlags: parseBooleanRecord((data as any).featureFlags, DEFAULT_PLATFORM_SETTINGS.featureFlags),
    driverTraining: parseDriverTraining((data as any).driverTraining),
    termsPolicy: parseTermsPolicy((data as any).termsPolicy),
    onboardingCopy: parseOnboardingCopy((data as any).onboardingCopy),
  };
}

function parseNegotiationSettings(raw: unknown): NegotiationSettings {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    isEnabled:
      typeof data.isEnabled === 'boolean'
        ? data.isEnabled
        : typeof data.is_enabled === 'boolean'
          ? data.is_enabled
          : DEFAULT_PLATFORM_SETTINGS.negotiation.isEnabled,
    maxRounds:
      typeof data.maxRounds === 'number'
        ? data.maxRounds
        : typeof data.max_rounds === 'number'
          ? data.max_rounds
          : DEFAULT_PLATFORM_SETTINGS.negotiation.maxRounds,
    maxTimeSec:
      typeof data.maxTimeSec === 'number'
        ? data.maxTimeSec
        : typeof data.max_time_sec === 'number'
          ? data.max_time_sec
          : DEFAULT_PLATFORM_SETTINGS.negotiation.maxTimeSec,
    saveMorePct:
      typeof data.saveMorePct === 'number'
        ? data.saveMorePct
        : typeof data.save_more_pct === 'number'
          ? data.save_more_pct
          : DEFAULT_PLATFORM_SETTINGS.negotiation.saveMorePct,
    priorityPickupPct:
      typeof data.priorityPickupPct === 'number'
        ? data.priorityPickupPct
        : typeof data.priority_pickup_pct === 'number'
          ? data.priority_pickup_pct
          : DEFAULT_PLATFORM_SETTINGS.negotiation.priorityPickupPct,
    minFare:
      typeof data.minFare === 'number'
        ? data.minFare
        : typeof data.min_fare === 'number'
          ? data.min_fare
          : DEFAULT_PLATFORM_SETTINGS.negotiation.minFare,
    maxFare:
      typeof data.maxFare === 'number'
        ? data.maxFare
        : typeof data.max_fare === 'number'
          ? data.max_fare
          : DEFAULT_PLATFORM_SETTINGS.negotiation.maxFare,
  };
}

function parseReferralSettings(raw: unknown): ReferralSettings {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const triggerEvent =
    data.triggerEvent === 'first_trip_completed' || data.trigger_event === 'first_trip_completed'
      ? 'first_trip_completed'
      : 'subscription_paid';
  return {
    commissionPct:
      typeof data.commissionPct === 'number'
        ? data.commissionPct
        : typeof data.commission_pct === 'number'
          ? data.commission_pct
          : DEFAULT_PLATFORM_SETTINGS.referral.commissionPct,
    staffCommissionPct:
      typeof data.staffCommissionPct === 'number'
        ? data.staffCommissionPct
        : typeof data.staff_commission_pct === 'number'
          ? data.staff_commission_pct
          : DEFAULT_PLATFORM_SETTINGS.referral.staffCommissionPct,
    referredDriverReward:
      typeof data.referredDriverReward === 'number'
        ? data.referredDriverReward
        : typeof data.referred_driver_reward === 'number'
          ? data.referred_driver_reward
          : DEFAULT_PLATFORM_SETTINGS.referral.referredDriverReward,
    minCashoutAmount:
      typeof data.minCashoutAmount === 'number'
        ? data.minCashoutAmount
        : typeof data.min_cashout_amount === 'number'
          ? data.min_cashout_amount
          : DEFAULT_PLATFORM_SETTINGS.referral.minCashoutAmount,
    triggerEvent,
    isActive:
      typeof data.isActive === 'boolean'
        ? data.isActive
        : typeof data.is_active === 'boolean'
          ? data.is_active
          : DEFAULT_PLATFORM_SETTINGS.referral.isActive,
  };
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function str(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}
function strOrNull(v: unknown, fallback: string | null): string | null {
  if (v === null) return null;
  return typeof v === 'string' ? v : fallback;
}
function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function numOrNull(v: unknown, fallback: number | null): number | null {
  if (v === null) return null;
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function parseCommissionSettings(raw: unknown): CommissionSettings {
  const d = obj(raw);
  return {
    ratePct: num(d.ratePct, DEFAULT_PLATFORM_SETTINGS.commission.ratePct),
    effectiveDate: str(d.effectiveDate, DEFAULT_PLATFORM_SETTINGS.commission.effectiveDate),
    nextRatePct: numOrNull(d.nextRatePct, DEFAULT_PLATFORM_SETTINGS.commission.nextRatePct),
    nextEffectiveDate: strOrNull(d.nextEffectiveDate, DEFAULT_PLATFORM_SETTINGS.commission.nextEffectiveDate),
  };
}

function parseMatchSettings(raw: unknown): MatchSettings {
  const d = obj(raw);
  const w = obj(d.ctsWeights);
  const defaults = DEFAULT_PLATFORM_SETTINGS.match;
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

function parsePaymentSettings(raw: unknown): PaymentSettings {
  const d = obj(raw);
  const defaults = DEFAULT_PLATFORM_SETTINGS.payment;
  return {
    paystackEnabled: bool(d.paystackEnabled, defaults.paystackEnabled),
    paystackTestMode: bool(d.paystackTestMode, defaults.paystackTestMode),
    cashEnabled: bool(d.cashEnabled, defaults.cashEnabled),
    ussdEnabled: bool(d.ussdEnabled, defaults.ussdEnabled),
    bankTransferEnabled: bool(d.bankTransferEnabled, defaults.bankTransferEnabled),
  };
}

function parsePromoDefaults(raw: unknown): PromoDefaultsSettings {
  const d = obj(raw);
  const defaults = DEFAULT_PLATFORM_SETTINGS.promoDefaults;
  return {
    discountType: d.discountType === 'fixed' ? 'fixed' : 'percent',
    discountValue: num(d.discountValue, defaults.discountValue),
    maxUses: numOrNull(d.maxUses, defaults.maxUses),
    expiryDays: num(d.expiryDays, defaults.expiryDays),
  };
}

function parseZoneEditorSettings(raw: unknown): ZoneEditorSettings {
  const d = obj(raw);
  const defaults = DEFAULT_PLATFORM_SETTINGS.zoneEditor;
  return {
    defaultSurgeMultiplier: num(d.defaultSurgeMultiplier, defaults.defaultSurgeMultiplier),
    availableZoneTypes:
      Array.isArray(d.availableZoneTypes) && d.availableZoneTypes.every((v) => typeof v === 'string')
        ? (d.availableZoneTypes as string[])
        : defaults.availableZoneTypes,
  };
}

function parseKycThresholds(raw: unknown): KycThresholdsSettings {
  const d = obj(raw);
  const defaults = DEFAULT_PLATFORM_SETTINGS.kycThresholds;
  const tier = d.fastTrackVerificationTier;
  return {
    reviewSlaHours: num(d.reviewSlaHours, defaults.reviewSlaHours),
    requireEstateEndorsement: bool(d.requireEstateEndorsement, defaults.requireEstateEndorsement),
    fastTrackVerificationTier:
      tier === 'tier_0' || tier === 'tier_1' || tier === 'tier_2' || tier === 'tier_3'
        ? tier
        : defaults.fastTrackVerificationTier,
  };
}

function parseBannerItem(raw: unknown) {
  const d = obj(raw);
  if (typeof d.message !== 'string' || !d.message) return null;
  const level = d.level === 'warning' || d.level === 'critical' ? d.level : 'info';
  return {
    id: str(d.id, crypto.randomUUID()),
    message: d.message,
    level: level as 'info' | 'warning' | 'critical',
    isActive: bool(d.isActive, true),
    startAt: strOrNull(d.startAt, null),
    endAt: strOrNull(d.endAt, null),
  };
}

function parseBanners(raw: unknown): BannersSettings {
  const d = obj(raw);
  const items = Array.isArray(d.items)
    ? d.items.map(parseBannerItem).filter((x): x is NonNullable<typeof x> => x !== null)
    : [];
  return { items };
}

function parseFaqItem(raw: unknown) {
  const d = obj(raw);
  if (typeof d.question !== 'string' || !d.question) return null;
  return {
    id: str(d.id, crypto.randomUUID()),
    question: d.question,
    answer: str(d.answer, ''),
    category: str(d.category, 'general'),
    order: num(d.order, 0),
  };
}

function parseFaq(raw: unknown): FaqSettings {
  const d = obj(raw);
  const items = Array.isArray(d.items)
    ? d.items.map(parseFaqItem).filter((x): x is NonNullable<typeof x> => x !== null)
    : [];
  return { items };
}

function parseStringRecord(raw: unknown, fallback: Record<string, string>): Record<string, string> {
  const d = obj(raw);
  const out: Record<string, string> = {};
  for (const key of Object.keys(d)) {
    const value = d[key];
    if (typeof value === 'string') out[key] = value;
  }
  return Object.keys(out).length ? out : { ...fallback };
}

function parseBooleanRecord(raw: unknown, fallback: Record<string, boolean>): Record<string, boolean> {
  const d = obj(raw);
  const out: Record<string, boolean> = {};
  for (const key of Object.keys(d)) {
    const value = d[key];
    if (typeof value === 'boolean') out[key] = value;
  }
  return Object.keys(out).length ? out : { ...fallback };
}

function parseDriverTrainingItem(raw: unknown) {
  const d = obj(raw);
  if (typeof d.title !== 'string' || !d.title) return null;
  return {
    id: str(d.id, crypto.randomUUID()),
    title: d.title,
    content: str(d.content, ''),
    order: num(d.order, 0),
  };
}

function parseDriverTraining(raw: unknown): DriverTrainingSettings {
  const d = obj(raw);
  const items = Array.isArray(d.items)
    ? d.items.map(parseDriverTrainingItem).filter((x): x is NonNullable<typeof x> => x !== null)
    : [];
  return { items };
}

function parseTermsPolicy(raw: unknown): TermsPolicySettings {
  const d = obj(raw);
  const defaults = DEFAULT_PLATFORM_SETTINGS.termsPolicy;
  return {
    termsText: str(d.termsText, defaults.termsText),
    privacyText: str(d.privacyText, defaults.privacyText),
    version: str(d.version, defaults.version),
    lastUpdated: strOrNull(d.lastUpdated, defaults.lastUpdated),
  };
}

function parseOnboardingStep(raw: unknown) {
  const d = obj(raw);
  if (typeof d.title !== 'string' || !d.title) return null;
  return {
    id: str(d.id, crypto.randomUUID()),
    title: d.title,
    body: str(d.body, ''),
    order: num(d.order, 0),
  };
}

function parseOnboardingCopy(raw: unknown): OnboardingCopySettings {
  const d = obj(raw);
  const steps = Array.isArray(d.steps)
    ? d.steps.map(parseOnboardingStep).filter((x): x is NonNullable<typeof x> => x !== null)
    : [];
  return { steps };
}

function maskFcmServerKey(settings: PlatformSettingsPayload): PlatformSettingsPayload {
  return {
    ...settings,
    fcmServerKey: settings.fcmServerKey ? FCM_KEY_MASK : '',
  };
}

const ACTIVE_TRIP_STATUSES = ['requested', 'matched', 'en_route', 'active'] as const;

function parseGeoPoint(geoJson: string | null | undefined): { lat: number; lng: number } | null {
  if (!geoJson) return null;
  const parsed = JSON.parse(geoJson);
  if (parsed.type === 'Point' && Array.isArray(parsed.coordinates)) {
    return { lng: parsed.coordinates[0], lat: parsed.coordinates[1] };
  }
  return null;
}

function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function mapZoneRow(row: any) {
  const geojson = JSON.parse(row.boundaryGeoJson);
  const coords = geojson.coordinates[0] || [];
  const boundary = coords.map((c: [number, number]) => ({
    lng: c[0],
    lat: c[1],
  }));

  return {
    id: row.id,
    name: row.name,
    zoneType: row.zoneType,
    boundary,
    surgeMultiplier: Number(row.surgeMultiplier),
    isActive: row.isActive,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  };
}

@Controller('admin')
@Roles('admin', 'super_admin')
@UseGuards(RolesGuard)
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly weeklyKpi: WeeklyKpiService,
    private readonly hceUsage: HceUsageService,
    private readonly ai: AiService,
    private readonly email: EmailService,
    private readonly otp: OtpService,
    private readonly settingsReader: PlatformSettingsReader,
  ) {}

  @Get('users/otp/:phone')
  async getUserOtp(
    @Param('phone') phone: string,
    @CurrentUser() admin: AuthUser,
  ) {
    const code = await this.otp.getOtp(phone);
    if (!code) {
      throw new AppException('NOT_FOUND', undefined, 'No active OTP found for this phone number');
    }
    // Audit log: admin viewed an OTP code
    await this.prisma.configAuditLog.create({
      data: {
        key: 'admin.otp.view',
        newValue: { phone },
        changedBy: admin.sub,
        changedByType: 'admin',
      },
    });
    return { phone, code };
  }

  @Get('weekly-kpis')
  async getWeeklyKpis(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<AdminGetWeeklyKpisResponse> {
    if (from && to) {
      return this.weeklyKpi.computeForPeriod(new Date(from), new Date(to));
    }
    const range = this.weeklyKpi.getCurrentWeekRange();
    return this.weeklyKpi.computeForPeriod(range.from, range.to);
  }

  @Get('weekly-kpis/history')
  async getWeeklyKpisHistory(
    @Query('weeks') weeks?: string,
  ): Promise<AdminGetWeeklyKpisHistoryResponse> {
    const count = Math.min(Math.max(Number(weeks) || 12, 1), 52);
    const history = await this.weeklyKpi.computeHistory(count);
    return { weeks: history };
  }

  @Get('dashboard/stats')
  async getDashboardStats() {
    const [
      totalDrivers,
      totalPassengers,
      activeTrips,
      completedTrips,
      pendingKyc,
      activeSubscriptions,
    ] = await Promise.all([
      this.prisma.driver.count(),
      this.prisma.user.count(),
      this.prisma.trip.count({ where: { status: { in: ['requested', 'matched', 'en_route', 'active'] } } }),
      this.prisma.trip.count({ where: { status: 'completed' } }),
      this.prisma.driver.count({ where: { kycStatus: 'pending' } }),
      this.prisma.subscription.count({ where: { isActive: true } }),
    ]);

    return {
      totalDrivers,
      totalPassengers,
      activeTrips,
      completedTrips,
      pendingKyc,
      activeSubscriptions,
    };
  }

  @Get('dashboard/overview')
  async getDashboardOverview() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date(todayStart);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

    const [
      activeTrips,
      onlineDrivers,
      totalDriversApproved,
      totalPassengers,
      tripsToday,
      todayCompletedTrips,
      openDisputes,
      pendingKyc,
      trendTrips,
      zoneDistribution,
    ] = await Promise.all([
      this.prisma.trip.count({
        where: { status: { in: [...ACTIVE_TRIP_STATUSES] } },
      }),
      this.prisma.driver.count({ where: { isOnline: true } }),
      this.prisma.driver.count({ where: { kycStatus: 'approved' } }),
      this.prisma.user.count(),
      this.prisma.trip.count({ where: { createdAt: { gte: todayStart } } }),
      this.prisma.trip.findMany({
        where: { status: 'completed', completedAt: { gte: todayStart } },
        select: { totalFare: true },
      }),
      this.prisma.dispute.count({
        where: { status: { in: ['open', 'investigating'] } },
      }),
      this.prisma.driver.count({
        where: { kycStatus: { in: ['pending', 'under_review'] } },
      }),
      this.prisma.trip.findMany({
        where: {
          status: 'completed',
          createdAt: { gte: sevenDaysAgo },
        },
        select: { createdAt: true, totalFare: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.$queryRaw<any[]>`
        SELECT z.name AS "zoneName", COUNT(t.id)::int AS trips
        FROM zones z
        LEFT JOIN trips t
          ON t.status = 'completed'
          AND ST_Contains(z.boundary::geometry, t.pickup_location::geometry)
        WHERE z.is_active = true
        GROUP BY z.id, z.name
        ORDER BY trips DESC
        LIMIT 10;
      `.catch(() => []),
    ]);

    const grossRevenueToday = todayCompletedTrips.reduce((sum, trip) => sum + trip.totalFare, 0);
    const commissionRate = (await this.settingsReader.getCommissionSettings()).ratePct / 100;
    const platformFeeToday = Math.round(grossRevenueToday * commissionRate);

    const tripTrendMap = new Map<string, { trips: number; gross: number }>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(sevenDaysAgo);
      d.setDate(d.getDate() + i);
      tripTrendMap.set(formatDateKey(d), { trips: 0, gross: 0 });
    }

    for (const trip of trendTrips) {
      const key = formatDateKey(trip.createdAt);
      const entry = tripTrendMap.get(key);
      if (entry) {
        entry.trips += 1;
        entry.gross += trip.totalFare;
      }
    }

    const tripTrend = Array.from(tripTrendMap.entries()).map(([date, value]) => ({
      date,
      trips: value.trips,
    }));

    const earningsTrend = Array.from(tripTrendMap.entries()).map(([date, value]) => ({
      date,
      gross: value.gross,
      fee: Math.round(value.gross * commissionRate),
    }));

    return {
      activeTrips,
      onlineDrivers,
      totalDriversApproved,
      totalPassengers,
      tripsToday,
      grossRevenueToday,
      platformFeeToday,
      openDisputes,
      pendingKyc,
      tripTrend,
      earningsTrend,
      zoneDistribution: zoneDistribution.map((row) => ({
        zoneName: row.zoneName,
        trips: Number(row.trips),
      })),
    };
  }

  @Get('trips/live')
  async getLiveTrips() {
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT
        t.id AS "tripId",
        t.status,
        t.driver_id AS "driverId",
        t.passenger_id AS "passengerId",
        t.started_at AS "startedAt",
        ST_AsGeoJSON(t.pickup_location) AS "pickupGeoJson",
        ST_AsGeoJSON(t.destination_location) AS "destGeoJson",
        ST_AsGeoJSON(d.current_location) AS "driverLocationGeoJson"
      FROM trips t
      LEFT JOIN drivers d ON d.id = t.driver_id
      WHERE t.status::text IN ('requested', 'matched', 'en_route', 'active');
    `;

    const trips = rows.map((row) => {
      const pickup = parseGeoPoint(row.pickupGeoJson);
      const destination = parseGeoPoint(row.destGeoJson);
      const driverLocation = parseGeoPoint(row.driverLocationGeoJson);

      return {
        tripId: row.tripId,
        status: row.status,
        driverId: row.driverId,
        driverLocation,
        pickup,
        destination,
        passengerId: row.passengerId,
        startedAt: row.startedAt ? row.startedAt.toISOString() : null,
      };
    }).filter((trip) => trip.pickup && trip.destination);

    return { trips };
  }

  @Get('drivers')
  async getDrivers(
    @Query('status') status?: string,
    @Query('kycStatus') kycStatus?: string,
    @Query('isOnline') isOnline?: string,
    @Query('isSuspended') isSuspended?: string,
    @Query('search') search?: string,
    @Query('limit') limit: number = 10,
    @Query('offset') offset: number = 0,
  ) {
    const where: any = {};
    if (status) where.isOnline = status === 'online';
    if (isOnline !== undefined && isOnline !== '') where.isOnline = isOnline === 'true';
    if (isSuspended !== undefined && isSuspended !== '') where.isSuspended = isSuspended === 'true';
    if (kycStatus) where.kycStatus = kycStatus;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { vehiclePlate: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [drivers, total] = await Promise.all([
      this.prisma.driver.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Number(limit),
        skip: Number(offset),
      }),
      this.prisma.driver.count({ where }),
    ]);

    return { drivers, total, limit: Number(limit), offset: Number(offset) };
  }

  @Put('drivers/:id/suspend')
  async suspendDriver(
    @Param('id') id: string,
    @Body() dto: { reason?: string },
    @CurrentUser() admin: AuthUser,
  ) {
    const driver = await this.prisma.driver.update({
      where: { id },
      data: { isSuspended: true, isOnline: false },
    });
    await this.prisma.configAuditLog.create({
      data: {
        key: 'admin.driver.suspend',
        previousValue: { isSuspended: false, isOnline: driver.isOnline },
        newValue: { isSuspended: true, isOnline: false, reason: dto.reason ?? null },
        changedBy: admin.sub,
        changedByType: 'admin',
      },
    });
    return { driverId: driver.id, isSuspended: driver.isSuspended, reason: dto.reason ?? null };
  }

  @Put('drivers/:id/reinstate')
  async reinstateDriver(
    @Param('id') id: string,
    @CurrentUser() admin: AuthUser,
  ) {
    const driver = await this.prisma.driver.update({
      where: { id },
      data: { isSuspended: false },
    });
    await this.prisma.configAuditLog.create({
      data: {
        key: 'admin.driver.reinstate',
        previousValue: { isSuspended: true },
        newValue: { isSuspended: false },
        changedBy: admin.sub,
        changedByType: 'admin',
      },
    });
    return { driverId: driver.id, isSuspended: driver.isSuspended };
  }

  @Get('drivers/:id')
  async getDriver(@Param('id') id: string) {
    const driver = await this.prisma.driver.findUnique({ where: { id } });
    if (!driver) throw new AppException('NOT_FOUND', undefined, 'Driver not found');
    return driver;
  }

  @Put('drivers/:id')
  async updateDriver(@Param('id') id: string, @Body() dto: UpdateDriverDto) {
    // Only update fields that are explicitly provided (allowlisted above)
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.vehiclePlate !== undefined) data.vehiclePlate = dto.vehiclePlate;
    if (dto.vehicleType !== undefined) data.vehicleType = dto.vehicleType;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.isOnline !== undefined) data.isOnline = dto.isOnline;
    if (dto.kycStatus !== undefined) data.kycStatus = dto.kycStatus;
    if (dto.ratingAvg !== undefined) data.ratingAvg = dto.ratingAvg;

    if (Object.keys(data).length === 0) {
      throw new AppException('VALIDATION_ERROR', undefined, 'No valid fields to update');
    }

    return this.prisma.driver.update({ where: { id }, data });
  }

  @Delete('drivers/:id')
  async deleteDriver(
    @Param('id') id: string,
    @CurrentUser() admin: AuthUser,
  ) {
    const driver = await this.prisma.driver.findUnique({ where: { id } });
    if (!driver) throw new AppException('NOT_FOUND', undefined, 'Driver not found');

    // Soft delete: deactivate instead of hard delete (trips/subscriptions reference this record)
    await this.prisma.driver.update({
      where: { id },
      data: { isActive: false, isOnline: false, isSuspended: true },
    });
    await this.prisma.configAuditLog.create({
      data: {
        key: 'admin.driver.soft_delete',
        previousValue: { isActive: driver.isActive, isSuspended: driver.isSuspended },
        newValue: { isActive: false, isOnline: false, isSuspended: true },
        changedBy: admin.sub,
        changedByType: 'admin',
      },
    });
    return { success: true, driverId: id, action: 'deactivated' };
  }

  @Get('kyc')
  async getKycPending(
    @Query('status') status?: string,
    @Query('limit') limit: number = 10,
    @Query('offset') offset: number = 0,
  ) {
    const where: any = {};
    if (status) where.kycStatus = status;

    const [drivers, total] = await Promise.all([
      this.prisma.driver.findMany({
        where,
        select: {
          id: true, name: true, phone: true, kycStatus: true,
          verificationTier: true, kycDocuments: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.driver.count({ where }),
    ]);

    return { drivers, total, limit, offset };
  }

  @Put('drivers/:id/kyc')
  async updateDriverKyc(
    @Param('id') id: string,
    @Body() dto: { kycStatus: string },
  ) {
    // Recompute verification tier to prevent staleness
    const driver = await this.prisma.driver.findUnique({ where: { id } });
    if (!driver) throw new AppException('NOT_FOUND', undefined, 'Driver not found');

    const docs = (driver.kycDocuments ?? {}) as Record<string, { status?: string }>;
    const { computeVerificationTier, getRequiredKycDocs } = await import('../kyc/kyc-state-machine');

    // Build the KycDocumentsMap from the JSONB blob
    const docsMap: Record<string, { status?: string }> = {};
    for (const [key, val] of Object.entries(docs)) {
      docsMap[key] = { status: val?.status };
    }

    const newTier = computeVerificationTier(docsMap as any, driver.vehicleType);

    return this.prisma.driver.update({
      where: { id },
      data: {
        kycStatus: dto.kycStatus as any,
        verificationTier: newTier,
      },
    });
  }

  @Get('disputes')
  async getDisputes(
    @Query('status') status?: string,
    @Query('limit') limit: number = 10,
    @Query('offset') offset: number = 0,
  ) {
    const where: any = {};
    if (status) where.status = status;

    const [disputes, total] = await Promise.all([
      this.prisma.dispute.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.dispute.count({ where }),
    ]);

    return { disputes, total, limit, offset };
  }

  @Put('disputes/:id')
  async resolveDispute(
    @Param('id') id: string,
    @Body() dto: { status: string; resolution?: string; refundAmount?: number },
  ) {
    return this.prisma.dispute.update({
      where: { id },
      data: {
        status: dto.status as any,
        resolution: dto.resolution,
      },
    });
  }

  @Get('notifications')
  async getNotifications(
    @Query('limit') limit: number = 10,
    @Query('offset') offset: number = 0,
  ) {
    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.notification.count(),
    ]);

    return { notifications, total, limit, offset };
  }

  @Post('notifications')
  async createNotification(@Body() dto: {
    userId: string; title: string; body: string; type: string; data?: any;
  }) {
    return this.prisma.notification.create({
      data: {
        userId: dto.userId,
        userType: 'passenger',
        title: dto.title,
        body: dto.body,
        type: dto.type,
        data: dto.data,
      },
    });
  }

  @Post('notifications/broadcast')
  async broadcastNotification(@Body() dto: {
    audience: 'all_passengers' | 'all_drivers' | 'online_drivers' | 'zone';
    zoneId?: string;
    title: string;
    body: string;
    type: string;
    data?: Record<string, unknown>;
  }) {
    let recipients: Array<{ userId: string; userType: 'passenger' | 'driver' }> = [];

    if (dto.audience === 'all_passengers') {
      const users = await this.prisma.user.findMany({ select: { id: true } });
      recipients = users.map((user) => ({ userId: user.id, userType: 'passenger' as const }));
    } else if (dto.audience === 'all_drivers') {
      const drivers = await this.prisma.driver.findMany({
        where: { userId: { not: null } },
        select: { userId: true },
      });
      recipients = drivers
        .filter((driver) => driver.userId)
        .map((driver) => ({ userId: driver.userId!, userType: 'driver' as const }));
    } else if (dto.audience === 'online_drivers') {
      const drivers = await this.prisma.driver.findMany({
        where: { isOnline: true, userId: { not: null } },
        select: { userId: true },
      });
      recipients = drivers
        .filter((driver) => driver.userId)
        .map((driver) => ({ userId: driver.userId!, userType: 'driver' as const }));
    } else if (dto.audience === 'zone' && dto.zoneId) {
      const drivers = await this.prisma.driver.findMany({
        where: { operatingZoneIds: { has: dto.zoneId }, userId: { not: null } },
        select: { userId: true },
      });
      recipients = drivers
        .filter((driver) => driver.userId)
        .map((driver) => ({ userId: driver.userId!, userType: 'driver' as const }));
    }

    const batch = recipients.slice(0, 500);
    await this.prisma.notification.createMany({
      data: batch.map((recipient) => ({
        userId: recipient.userId,
        userType: recipient.userType,
        title: dto.title,
        body: dto.body,
        type: dto.type,
        data: dto.data,
        sentAt: new Date(),
      })),
    });

    return { recipients: recipients.length, queued: true };
  }

  @Get('zones')
  async getZones(@Query('type') type?: string) {
    const rows = type
      ? await this.prisma.$queryRaw<any[]>`
          SELECT
            id,
            name,
            zone_type AS "zoneType",
            ST_AsGeoJSON(boundary) AS "boundaryGeoJson",
            surge_multiplier AS "surgeMultiplier",
            is_active AS "isActive",
            created_at AS "createdAt"
          FROM zones
          WHERE zone_type::text = ${type}
          ORDER BY name ASC;
        `
      : await this.prisma.$queryRaw<any[]>`
          SELECT
            id,
            name,
            zone_type AS "zoneType",
            ST_AsGeoJSON(boundary) AS "boundaryGeoJson",
            surge_multiplier AS "surgeMultiplier",
            is_active AS "isActive",
            created_at AS "createdAt"
          FROM zones
          ORDER BY name ASC;
        `;

    return rows.map(mapZoneRow);
  }

  @Post('zones')
  async createZone(@Body() dto: {
    name: string;
    zoneType: string;
    boundary: Array<{ lat: number; lng: number }>;
    surgeMultiplier?: number;
  }) {
    if (!dto.boundary || dto.boundary.length < 3) {
      throw new AppException('VALIDATION_ERROR', undefined, 'Zone boundary requires at least 3 points');
    }

    // Validate all coordinates are finite numbers to prevent SQL injection
    for (const point of dto.boundary) {
      if (typeof point.lat !== 'number' || typeof point.lng !== 'number' ||
          !Number.isFinite(point.lat) || !Number.isFinite(point.lng) ||
          point.lat < -90 || point.lat > 90 || point.lng < -180 || point.lng > 180) {
        throw new AppException('VALIDATION_ERROR', undefined, 'Invalid coordinate in zone boundary');
      }
    }

    const ring = [...dto.boundary];
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first.lat !== last.lat || first.lng !== last.lng) {
      ring.push(first);
    }

    const pointLiterals = ring.map((point) => `ST_MakePoint(${point.lng}, ${point.lat})`).join(', ');

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO zones (id, name, zone_type, boundary, surge_multiplier, is_active, created_at)
       VALUES (
         gen_random_uuid(),
         $1,
         $2::"ZoneType",
         ST_SetSRID(ST_MakePolygon(ST_MakeLine(ARRAY[${pointLiterals}])), 4326)::geography,
         $3,
         true,
         NOW()
       )
       RETURNING
         id,
         name,
         zone_type AS "zoneType",
         ST_AsGeoJSON(boundary) AS "boundaryGeoJson",
         surge_multiplier AS "surgeMultiplier",
         is_active AS "isActive",
         created_at AS "createdAt"`,
      dto.name,
      dto.zoneType,
      dto.surgeMultiplier ?? 1.0,
    );

    return mapZoneRow(rows[0]);
  }

  @Delete('zones/:id')
  async deleteZone(@Param('id') id: string) {
    await this.prisma.$executeRaw`DELETE FROM zones WHERE id = ${id}::uuid`;
    return { deleted: true, zoneId: id };
  }

  @Get('pricing')
  async getPricing(
    @Query('vehicleType') vehicleType?: string,
    @Query('limit') limit: number = 10,
    @Query('offset') offset: number = 0,
  ) {
    const where: any = {};
    if (vehicleType) where.vehicleType = vehicleType;

    const [pricing, total] = await Promise.all([
      this.prisma.pricingConfig.findMany({
        where,
        orderBy: { vehicleType: 'asc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.pricingConfig.count({ where }),
    ]);

    return { pricing, total, limit, offset };
  }

  @Put('pricing')
  async upsertPricing(@Body() dto: {
    vehicleType: string;
    baseFare: number;
    perKmFare: number;
    perMinFare: number;
    minFare: number;
  }) {
    const existing = await this.prisma.pricingConfig.findFirst({
      where: { vehicleType: dto.vehicleType as any, isActive: true },
    });

    if (existing) {
      return this.prisma.pricingConfig.update({
        where: { id: existing.id },
        data: {
          baseFare: dto.baseFare,
          perKmFare: dto.perKmFare,
          perMinFare: dto.perMinFare,
          minFare: dto.minFare,
        },
      });
    }

    return this.prisma.pricingConfig.create({
      data: {
        vehicleType: dto.vehicleType as any,
        baseFare: dto.baseFare,
        perKmFare: dto.perKmFare,
        perMinFare: dto.perMinFare,
        minFare: dto.minFare,
      },
    });
  }

  @Put('pricing/:id')
  async updatePricing(@Param('id') id: string, @Body() dto: any) {
    return this.prisma.pricingConfig.update({ where: { id }, data: dto });
  }

  @Get('users')
  async getUsers(
    @Query('search') search?: string,
    @Query('isBlocked') isBlocked?: string,
    @Query('limit') limit: number = 10,
    @Query('offset') offset: number = 0,
  ) {
    const where: any = {};
    if (isBlocked !== undefined && isBlocked !== '') {
      where.isBlocked = isBlocked === 'true';
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Number(limit),
        skip: Number(offset),
        select: {
          id: true, name: true, email: true, phone: true,
          isBlocked: true, totalTrips: true, ratingAvg: true, createdAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      users: users.map((user) => ({
        ...user,
        ratingAvg: Number(user.ratingAvg),
      })),
      total,
      limit: Number(limit),
      offset: Number(offset),
    };
  }

  @Put('users/:id/block')
  async blockUser(
    @Param('id') id: string,
    @CurrentUser() admin: AuthUser,
  ) {
    const user = await this.prisma.user.update({ where: { id }, data: { isBlocked: true } });
    await this.prisma.configAuditLog.create({
      data: {
        key: 'admin.user.block',
        previousValue: { isBlocked: false },
        newValue: { isBlocked: true },
        changedBy: admin.sub,
        changedByType: 'admin',
      },
    });
    return user;
  }

  @Put('users/:id/unblock')
  async unblockUser(
    @Param('id') id: string,
    @CurrentUser() admin: AuthUser,
  ) {
    const user = await this.prisma.user.update({ where: { id }, data: { isBlocked: false } });
    await this.prisma.configAuditLog.create({
      data: {
        key: 'admin.user.unblock',
        previousValue: { isBlocked: true },
        newValue: { isBlocked: false },
        changedBy: admin.sub,
        changedByType: 'admin',
      },
    });
    return user;
  }

  @Get('settings')
  async getSettings() {
    const row = await this.prisma.platformSettings.findUnique({
      where: { id: PLATFORM_SETTINGS_ID },
    });

    const settings = parsePlatformSettings(row?.settings ?? DEFAULT_PLATFORM_SETTINGS);
    return maskFcmServerKey(settings);
  }

  @Get('hce/status')
  async getAiStatus() {
    return {
      ai: this.ai.getStatus(),
      hce: parsePlatformSettings(
        (await this.prisma.platformSettings.findUnique({ where: { id: PLATFORM_SETTINGS_ID } }))?.settings ??
          DEFAULT_PLATFORM_SETTINGS,
      ).hce,
      usage: await this.hceUsage.getCounters(),
    };
  }

  @Put('settings')
  @Roles('admin', 'super_admin')
  async updateSettings(
    @CurrentUser() user: AuthUser,
    @Body() dto: Partial<PlatformSettingsPayload>,
  ) {
    const requestedKeys = Object.keys(dto) as (keyof PlatformSettingsPayload)[];

    if (user.role !== 'super_admin') {
      const forbiddenKeys = requestedKeys.filter((key) => SUPER_ADMIN_ONLY_SETTINGS_KEYS.has(key));
      if (forbiddenKeys.length) {
        throw new AppException(
          'FORBIDDEN',
          undefined,
          `Requires super_admin to edit: ${forbiddenKeys.join(', ')}`,
        );
      }
    }

    const existingRow = await this.prisma.platformSettings.findUnique({
      where: { id: PLATFORM_SETTINGS_ID },
    });
    const current = parsePlatformSettings(existingRow?.settings ?? DEFAULT_PLATFORM_SETTINGS);

    const incomingFcmKey = dto.fcmServerKey;
    const shouldKeepExistingFcmKey =
      incomingFcmKey === undefined ||
      incomingFcmKey === '' ||
      incomingFcmKey === FCM_KEY_MASK;

    const next: PlatformSettingsPayload = {
      googleMapsOriginRestriction:
        typeof dto.googleMapsOriginRestriction === 'string'
          ? dto.googleMapsOriginRestriction
          : current.googleMapsOriginRestriction,
      smsGatewayChannel:
        dto.smsGatewayChannel === 'africastalking' || dto.smsGatewayChannel === 'termii'
          ? dto.smsGatewayChannel
          : current.smsGatewayChannel,
      fcmServerKey: shouldKeepExistingFcmKey ? current.fcmServerKey : incomingFcmKey!,
      maintenanceMode:
        typeof dto.maintenanceMode === 'boolean' ? dto.maintenanceMode : current.maintenanceMode,
      hce: dto.hce ? parseHceConfig(dto.hce) : current.hce,
      negotiation: dto.negotiation ? parseNegotiationSettings(dto.negotiation) : current.negotiation,
      referral: dto.referral ? parseReferralSettings(dto.referral) : current.referral,
      commission: dto.commission ? parseCommissionSettings(dto.commission) : current.commission,
      match: dto.match ? parseMatchSettings(dto.match) : current.match,
      payment: dto.payment ? parsePaymentSettings(dto.payment) : current.payment,
      promoDefaults: dto.promoDefaults ? parsePromoDefaults(dto.promoDefaults) : current.promoDefaults,
      zoneEditor: dto.zoneEditor ? parseZoneEditorSettings(dto.zoneEditor) : current.zoneEditor,
      kycThresholds: dto.kycThresholds ? parseKycThresholds(dto.kycThresholds) : current.kycThresholds,
      banners: dto.banners ? parseBanners(dto.banners) : current.banners,
      faq: dto.faq ? parseFaq(dto.faq) : current.faq,
      appCopy: dto.appCopy ? parseStringRecord(dto.appCopy, current.appCopy) : current.appCopy,
      featureFlags: dto.featureFlags
        ? parseBooleanRecord(dto.featureFlags, current.featureFlags)
        : current.featureFlags,
      driverTraining: dto.driverTraining ? parseDriverTraining(dto.driverTraining) : current.driverTraining,
      termsPolicy: dto.termsPolicy ? parseTermsPolicy(dto.termsPolicy) : current.termsPolicy,
      onboardingCopy: dto.onboardingCopy ? parseOnboardingCopy(dto.onboardingCopy) : current.onboardingCopy,
    };

    const auditRows = requestedKeys
      .filter((key) => JSON.stringify(current[key]) !== JSON.stringify(next[key]))
      .map((key) => {
        const isSecret = key === 'fcmServerKey';
        return {
          key,
          previousValue: (isSecret ? (current[key] ? FCM_KEY_MASK : '') : current[key]) as any,
          newValue: (isSecret ? (next[key] ? FCM_KEY_MASK : '') : next[key]) as any,
          changedBy: user.sub,
          changedByType: user.type,
        };
      });

    const row = await this.prisma.platformSettings.upsert({
      where: { id: PLATFORM_SETTINGS_ID },
      create: { id: PLATFORM_SETTINGS_ID, settings: next as any },
      update: { settings: next as any },
    });

    if (auditRows.length) {
      await this.prisma.configAuditLog.createMany({ data: auditRows });
    }

    // Invalidate the in-memory cache so matching engine picks up new settings
    this.settingsReader.invalidate();

    return maskFcmServerKey(parsePlatformSettings(row.settings));
  }

  @Get('settings/audit')
  @Roles('super_admin')
  async getSettingsAudit(
    @Query('key') key?: string,
    @Query('limit') limit: number = 25,
    @Query('offset') offset: number = 0,
  ) {
    const where: any = {};
    if (key) where.key = key;

    const [logs, total] = await Promise.all([
      this.prisma.configAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Number(limit),
        skip: Number(offset),
        include: { admin: { select: { id: true, name: true, email: true, role: true } } },
      }),
      this.prisma.configAuditLog.count({ where }),
    ]);

    return { logs, total, limit: Number(limit), offset: Number(offset) };
  }

  @Post('users/invite')
  @Roles('super_admin')
  async inviteAdminUser(
    @Body() dto: { email?: string; name?: string; role?: 'admin' | 'moderator' | 'super_admin' },
  ) {
    if (!dto.email) {
      throw new AppException('VALIDATION_ERROR', undefined, 'Email is required');
    }

    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.adminUser.findUnique({ where: { email } });
    if (existing) {
      throw new AppException('VALIDATION_ERROR', undefined, 'Admin user already exists');
    }

    const temporaryPassword = crypto.randomBytes(12).toString('base64url');
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);
    const admin = await this.prisma.adminUser.create({
      data: {
        email,
        name: dto.name ?? email,
        role: dto.role ?? 'admin',
        passwordHash,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    const emailSent = await this.email.send({
      to: email,
      subject: 'Your HiGO admin invitation',
      html: `<p>You have been invited to HiGO Admin.</p><p>Temporary password: <strong>${temporaryPassword}</strong></p>`,
      text: `You have been invited to HiGO Admin. Temporary password: ${temporaryPassword}`,
    });

    return {
      admin,
      invited: true,
      emailSent,
      temporaryPassword: emailSent ? undefined : temporaryPassword,
    };
  }
}
