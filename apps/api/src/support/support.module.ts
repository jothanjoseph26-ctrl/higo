import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SupportController } from './support.controller';

@Module({
  imports: [PrismaModule],
  controllers: [SupportController],
})
export class SupportModule {}
