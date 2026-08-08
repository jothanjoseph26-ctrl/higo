import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformSettingsReader } from '../admin/platform-settings-reader.service';
import { LatLng, CompositeTrustScore } from '@higo/shared-types';

export interface CtsContext {
  distanceMeters: number;
  pickup: LatLng;
}

@Injectable()
export class CtsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PlatformSettingsReader,
  ) {}

  async computeCTS(driverId: string, ctx: CtsContext): Promise<CompositeTrustScore> {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
    });

    if (!driver) {
      throw new Error(`Driver not found for CTS calculation: ${driverId}`);
    }

    const { ctsWeights, radiusMeters } = await this.settings.getMatchSettings();

    // 1. Identity Verification: NIN Verified (+N)
    const ninPoints = driver.verificationTier !== 'tier_0' ? ctsWeights.ninVerifiedPoints : 0;

    // 2. Driver History: tiered points based on trip count
    let historyPoints = 0;
    if (driver.totalTrips >= 1000) {
      historyPoints = ctsWeights.trips1000Points;
    } else if (driver.totalTrips >= 500) {
      historyPoints = ctsWeights.trips500Points;
    } else if (driver.totalTrips >= 100) {
      historyPoints = ctsWeights.trips100Points;
    }

    // 3. Passenger Ratings
    const ratingVal = Number(driver.ratingAvg);
    const ratingPoints = ratingVal >= 4.8 ? ctsWeights.ratingAbove48Points : 0;

    // 4. Estate Endorsement
    const kycDocs = (driver.kycDocuments as any) || {};
    const estatePoints = kycDocs.estateEndorsementApproved === true ? ctsWeights.estateEndorsementPoints : 0;

    // 5. Referral Reputation
    const referralPoints = kycDocs.referralApproved === true ? ctsWeights.referralApprovedPoints : 0;

    // 6. Geo Proximity (+20 max): linear decay from pickup to search radius
    const geoProximityScore = 1.0 - Math.min(1.0, Math.max(0.0, ctx.distanceMeters / radiusMeters));
    const geoPoints = geoProximityScore * 20;

    const maxPossible =
      ctsWeights.ninVerifiedPoints +
      ctsWeights.trips1000Points +
      ctsWeights.ratingAbove48Points +
      ctsWeights.estateEndorsementPoints +
      ctsWeights.referralApprovedPoints +
      20; // geo proximity max

    const totalPoints =
      ninPoints + historyPoints + ratingPoints + estatePoints + referralPoints + geoPoints;
    const total = totalPoints / maxPossible;

    return {
      driverId,
      referralProximity: referralPoints / ctsWeights.referralApprovedPoints,
      estateEndorsement: estatePoints / ctsWeights.estateEndorsementPoints,
      completionRate: historyPoints / ctsWeights.trips1000Points,
      recencyActivity: 1.0,
      ratingScore: ratingPoints / ctsWeights.ratingAbove48Points,
      geoProximity: geoProximityScore,
      verificationTier: ninPoints / ctsWeights.ninVerifiedPoints,
      jobVolumeSignal: historyPoints / ctsWeights.trips1000Points,
      total: Math.min(1.0, Math.max(0.0, total)),
    };
  }
}
