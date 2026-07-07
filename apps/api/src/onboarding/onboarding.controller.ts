import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { RateLimit, RateLimitGuard } from '../common/guards/rate-limit.guard';
import { CreateContactSubmissionDto } from './dto/contact-submission.dto';
import { CreateDriverApplicationDto } from './dto/driver-application.dto';
import { OnboardingService } from './onboarding.service';

@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit({
    scope: 'driver-application',
    limit: 5,
    windowSeconds: 3600,
    keyFrom: 'phone',
  })
  @Post('driver-applications')
  createDriverApplication(@Body() dto: CreateDriverApplicationDto) {
    return this.onboardingService.createDriverApplication(dto);
  }

  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit({
    scope: 'contact-submission',
    limit: 10,
    windowSeconds: 3600,
    keyFrom: 'ip',
  })
  @Post('contact-submissions')
  createContactSubmission(@Body() dto: CreateContactSubmissionDto) {
    return this.onboardingService.createContactSubmission(dto);
  }
}
