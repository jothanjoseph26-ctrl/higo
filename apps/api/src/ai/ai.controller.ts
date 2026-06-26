import { Controller, Get, Param, Post, Body } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { AiFeaturesService } from './ai-features.service';
import { AiService } from './ai.service';

@Controller('admin/ai')
@Roles('admin', 'super_admin')
export class AiController {
  constructor(
    private readonly aiFeatures: AiFeaturesService,
    private readonly ai: AiService,
  ) {}

  @Get('status')
  getStatus() {
    return this.ai.getStatus();
  }

  @Post('fraud/trip/:tripId')
  analyzeTripFraud(@Param('tripId') tripId: string) {
    return this.aiFeatures.analyzeTripFraud(tripId);
  }

  @Post('matching/insight')
  matchingInsight(
    @Body()
    body: {
      pickupAddress: string;
      vehicleType: string;
      candidateCount: number;
      avgDistanceMeters: number;
    },
  ) {
    return this.aiFeatures.getMatchingInsight(body);
  }
}