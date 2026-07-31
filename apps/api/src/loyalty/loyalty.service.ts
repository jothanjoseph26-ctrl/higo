import { Injectable } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LoyaltyService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreate(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppException('NOT_FOUND', undefined, 'Passenger profile not found');
    }

    return this.prisma.loyaltyAccount.upsert({
      where: { userId },
      create: {
        userId,
        referralCode: this.buildReferralCode(user.name ?? user.phone),
      },
      update: {},
    });
  }

  async award(userId: string, points = 10, tripId?: string) {
    const account = await this.getOrCreate(userId);
    const awarded = Math.max(0, Math.round(points));
    const totalEarned = account.totalEarned + awarded;
    const tier = this.tierFor(totalEarned);
    return {
      account: await this.prisma.loyaltyAccount.update({
        where: { id: account.id },
        data: {
          points: { increment: awarded },
          totalEarned: { increment: awarded },
          tripsCompleted: tripId ? { increment: 1 } : undefined,
          tier,
        },
      }),
      awarded,
    };
  }

  async redeem(userId: string, points: number) {
    const account = await this.getOrCreate(userId);
    const redeemed = Math.max(0, Math.round(points));
    if (redeemed <= 0) {
      throw new AppException('VALIDATION_ERROR', undefined, 'Points must be greater than zero');
    }
    if (account.points < redeemed) {
      throw new AppException('VALIDATION_ERROR', undefined, 'Insufficient points');
    }

    const updated = await this.prisma.loyaltyAccount.update({
      where: { id: account.id },
      data: {
        points: { decrement: redeemed },
        totalRedeemed: { increment: redeemed },
      },
    });

    return {
      account: updated,
      redeemed,
      rideDiscountKobo: redeemed * 100,
      walletCredited: 0,
    };
  }

  private tierFor(totalEarned: number) {
    if (totalEarned >= 5000) return 'platinum';
    if (totalEarned >= 2000) return 'gold';
    if (totalEarned >= 500) return 'silver';
    return 'bronze';
  }

  private buildReferralCode(seed: string): string {
    const prefix = seed.replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase() || 'HIGO';
    return `${prefix}${Math.floor(1000 + Math.random() * 9000)}`;
  }
}
