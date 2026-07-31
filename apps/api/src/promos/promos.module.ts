import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PromosService } from './promos.service';
import { PromosController } from './promos.controller';
import { PromoValidationController } from './promo-validation.controller';

@Module({
  imports: [PrismaModule],
  providers: [PromosService],
  controllers: [PromosController, PromoValidationController],
  exports: [PromosService],
})
export class PromosModule {}
