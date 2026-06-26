import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AiController } from './ai.controller';
import { AiFeaturesService } from './ai-features.service';
import { AiService } from './ai.service';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [AiController],
  providers: [AiService, AiFeaturesService],
  exports: [AiService, AiFeaturesService],
})
export class AiModule {}
