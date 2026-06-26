import { Injectable } from '@nestjs/common';
import { PromoCode, PromoDiscountType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/errors/app.exception';
import { CreatePromoDto, UpdatePromoDto } from './dto/promo.dto';

export interface PromoDiscountResult {
  totalFare: number;
  discountAmount: number;
  promoCode: string;
}

@Injectable()
export class PromosService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  private mapPromo(promo: PromoCode) {
    return {
      id: promo.id,
      code: promo.code,
      discountType: promo.discountType,
      discountValue: promo.discountValue,
      maxUses: promo.maxUses,
      usedCount: promo.usedCount,
      expiresAt: promo.expiresAt ? promo.expiresAt.toISOString() : null,
      isActive: promo.isActive,
      createdAt: promo.createdAt.toISOString(),
      updatedAt: promo.updatedAt.toISOString(),
    };
  }

  async list(limit = 50, offset = 0) {
    const [promos, total] = await Promise.all([
      this.prisma.promoCode.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.promoCode.count(),
    ]);

    return {
      promos: promos.map((promo) => this.mapPromo(promo)),
      total,
      limit,
      offset,
    };
  }

  async create(dto: CreatePromoDto) {
    const code = this.normalizeCode(dto.code);
    const existing = await this.prisma.promoCode.findUnique({ where: { code } });
    if (existing) {
      throw new AppException('VALIDATION_ERROR', undefined, 'Promo code already exists');
    }

    const promo = await this.prisma.promoCode.create({
      data: {
        code,
        discountType: dto.discountType,
        discountValue: dto.discountValue,
        maxUses: dto.maxUses ?? null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        isActive: dto.isActive ?? true,
      },
    });

    return this.mapPromo(promo);
  }

  async update(id: string, dto: UpdatePromoDto) {
    const existing = await this.prisma.promoCode.findUnique({ where: { id } });
    if (!existing) {
      throw new AppException('NOT_FOUND', undefined, 'Promo code not found');
    }

    if (dto.code) {
      const code = this.normalizeCode(dto.code);
      const duplicate = await this.prisma.promoCode.findFirst({
        where: { code, NOT: { id } },
      });
      if (duplicate) {
        throw new AppException('VALIDATION_ERROR', undefined, 'Promo code already exists');
      }
    }

    const promo = await this.prisma.promoCode.update({
      where: { id },
      data: {
        ...(dto.code !== undefined ? { code: this.normalizeCode(dto.code) } : {}),
        ...(dto.discountType !== undefined ? { discountType: dto.discountType } : {}),
        ...(dto.discountValue !== undefined ? { discountValue: dto.discountValue } : {}),
        ...(dto.maxUses !== undefined ? { maxUses: dto.maxUses } : {}),
        ...(dto.expiresAt !== undefined
          ? { expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    return this.mapPromo(promo);
  }

  async remove(id: string) {
    const existing = await this.prisma.promoCode.findUnique({ where: { id } });
    if (!existing) {
      throw new AppException('NOT_FOUND', undefined, 'Promo code not found');
    }

    await this.prisma.promoCode.delete({ where: { id } });
    return { deleted: true, promoId: id };
  }

  private assertPromoUsable(promo: PromoCode): void {
    if (!promo.isActive) {
      throw new AppException('VALIDATION_ERROR', undefined, 'Promo code is inactive');
    }
    if (promo.expiresAt && promo.expiresAt < new Date()) {
      throw new AppException('VALIDATION_ERROR', undefined, 'Promo code has expired');
    }
    if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
      throw new AppException('VALIDATION_ERROR', undefined, 'Promo code usage limit reached');
    }
  }

  applyDiscount(promo: PromoCode, totalFare: number): PromoDiscountResult {
    let discountAmount = 0;

    if (promo.discountType === PromoDiscountType.percent) {
      discountAmount = Math.round((totalFare * promo.discountValue) / 10000);
    } else {
      discountAmount = Math.min(promo.discountValue, totalFare);
    }

    return {
      totalFare: Math.max(0, totalFare - discountAmount),
      discountAmount,
      promoCode: promo.code,
    };
  }

  async validateAndRedeem(code: string): Promise<PromoCode> {
    const normalizedCode = this.normalizeCode(code);

    return this.prisma.$transaction(async (tx) => {
      const promo = await tx.promoCode.findUnique({ where: { code: normalizedCode } });
      if (!promo) {
        throw new AppException('NOT_FOUND', undefined, 'Promo code not found');
      }

      this.assertPromoUsable(promo);

      return tx.promoCode.update({
        where: { id: promo.id },
        data: { usedCount: { increment: 1 } },
      });
    });
  }
}