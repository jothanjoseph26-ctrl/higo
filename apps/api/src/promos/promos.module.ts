import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PromosService } from './promos.service';
import { PromosController } from './promos.controller';

@Module({
  imports: [PrismaModule],
  providers: [PromosService],
  controllers: [PromosController],
  exports: [PromosService],
})
export class PromosModule {}