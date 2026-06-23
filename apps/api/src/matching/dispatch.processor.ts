import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { MatchingService } from './matching.service';

@Processor('dispatch')
export class DispatchProcessor {
  constructor(private readonly matchingService: MatchingService) {}

  @Process('timeout')
  async handleTimeout(
    job: Job<{ tripId: string; driverId: string; offerId: string }>,
  ): Promise<void> {
    const { tripId, driverId, offerId } = job.data;
    await this.matchingService.handleOfferTimeout(tripId, driverId, offerId);
  }
}
