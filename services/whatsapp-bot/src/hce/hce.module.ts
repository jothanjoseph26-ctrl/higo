import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { HceService } from './hce.service';

@Module({
  imports: [PrismaModule],
  providers: [HceService],
  exports: [HceService],
})
export class HceModule {}
