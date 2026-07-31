import { Body, Controller, Post } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception';
import { PromosService } from './promos.service';
import { ValidatePromoDto } from './dto/promo.dto';

@Controller('promos')
export class PromoValidationController {
  constructor(private readonly promosService: PromosService) {}

  @Post('validate')
  async validate(@Body() dto: ValidatePromoDto) {
    try {
      const promo = await this.promosService.validate(dto.code);
      const fareAmount = dto.fareAmount ?? dto.fare_amount ?? 0;
      const discount = this.promosService.applyDiscount(promo, fareAmount);
      const discountType = promo.discountType === 'percent' ? 'percentage' : 'fixed';
      const discountValue =
        promo.discountType === 'percent'
          ? promo.discountValue / 100
          : promo.discountValue;

      return {
        valid: true,
        code: promo.code,
        discountType,
        discount_type: discountType,
        discountValue,
        discount_value: discountValue,
        discountAmount: discount.discountAmount,
        discount_amount: discount.discountAmount,
        description: null,
      };
    } catch (error) {
      if (error instanceof AppException) {
        const response = error.getResponse();
        const message =
          typeof response === 'object' &&
          response !== null &&
          'error' in response &&
          typeof (response as { error?: { message?: unknown } }).error?.message === 'string'
            ? (response as { error: { message: string } }).error.message
            : error.message;
        return {
          valid: false,
          message,
        };
      }
      throw error;
    }
  }
}
