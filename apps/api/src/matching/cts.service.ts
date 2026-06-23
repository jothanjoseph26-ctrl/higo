import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LatLng, CompositeTrustScore } from '@higo/shared-types';

export interface CtsContext {
  distanceMeters: number;
  pickup: LatLng;
}

@Injectable()
export class CtsService {
  constructor(private readonly prisma: PrismaService) {}

  async computeCTS(driverId: string, ctx: CtsContext): Promise<CompositeTrustScore> {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
    });

    if (!driver) {
      throw new Error(`Driver not found for CTS calculation: ${driverId}`);
    }

    // 1. Identity Verification: NIN Verified (+25)
    // tier_1, tier_2, tier_3 mean NIN is verified
    const ninPoints = driver.verificationTier !== 'tier_0' ? 25 : 0;

    // 2. Driver History: 100 Trips (+10), 500 Trips (+20), 1000 Trips (+30)
    let historyPoints = 0;
    if (driver.totalTrips >= 1000) {
      historyPoints = 30;
    } else if (driver.totalTrips >= 500) {
      historyPoints = 20;
    } else if (driver.totalTrips >= 100) {
      historyPoints = 10;
    }

    // 3. Passenger Ratings: 4.8+ (+20)
    const ratingVal = Number(driver.ratingAvg);
    const ratingPoints = ratingVal >= 4.8 ? 20 : 0;

    // 4. Estate Endorsement (+15)
    // Check if estate endorsement is verified/approved in driver kycDocuments
    const kycDocs = (driver.kycDocuments as any) || {};
    const estatePoints = kycDocs.estateEndorsementApproved === true ? 15 : 0;

    // 5. Referral Reputation (+10)
    // Check if referral reputational invite is approved
    const referralPoints = kycDocs.referralApproved === true ? 10 : 0;

    // Sum points (0..100)
    const totalPoints = ninPoints + historyPoints + ratingPoints + estatePoints + referralPoints;
    const total = totalPoints / 100; // Map to 0..1 scale for CompositeTrustScore type compatibility

    return {
      driverId,
      referralProximity: referralPoints / 10,
      estateEndorsement: estatePoints / 15,
      completionRate: historyPoints / 30, // mapping history weight to float
      recencyActivity: 1.0,
      ratingScore: ratingPoints / 20,
      geoProximity: 1.0 - Math.min(1.0, Math.max(0.0, ctx.distanceMeters / 5000.0)),
      verificationTier: ninPoints / 25,
      jobVolumeSignal: historyPoints / 30,
      total: Math.min(1.0, Math.max(0.0, total)),
    };
  }
}
