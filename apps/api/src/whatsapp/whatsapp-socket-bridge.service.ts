import { Injectable, Logger } from '@nestjs/common';
import { MatchingService } from '../matching/matching.service';
import { TripService } from '../trips/trips.service';
import { TripStatus } from '@higo/shared-types';

@Injectable()
export class WhatsAppSocketBridge {
  private readonly logger = new Logger(WhatsAppSocketBridge.name);

  constructor(
    private readonly matchingService: MatchingService,
    private readonly tripService: TripService,
  ) {}

  async acceptTrip(driverId: string, tripId: string): Promise<void> {
    try {
      await this.matchingService.acceptOffer(driverId, tripId);
      this.logger.log(`WhatsApp driver ${driverId} accepted trip ${tripId}`);
    } catch (error) {
      this.logger.error(`Failed to accept trip: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async declineTrip(driverId: string, tripId: string, reason?: string): Promise<void> {
    try {
      await this.matchingService.declineOffer(driverId, tripId, reason || 'whatsapp_decline');
      this.logger.log(`WhatsApp driver ${driverId} declined trip ${tripId}`);
    } catch (error) {
      this.logger.error(`Failed to decline trip: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async arrivedAtPickup(driverId: string, tripId: string): Promise<void> {
    try {
      await this.tripService.transition(tripId, TripStatus.ARRIVED, 'driver', driverId);
      this.logger.log(`WhatsApp driver ${driverId} arrived at pickup for trip ${tripId}`);
    } catch (error) {
      this.logger.error(`Failed to mark arrived: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async startTrip(driverId: string, tripId: string): Promise<void> {
    try {
      await this.tripService.transition(tripId, TripStatus.ACTIVE, 'driver', driverId);
      this.logger.log(`WhatsApp driver ${driverId} started trip ${tripId}`);
    } catch (error) {
      this.logger.error(`Failed to start trip: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async completeTrip(driverId: string, tripId: string): Promise<void> {
    try {
      await this.tripService.transition(tripId, TripStatus.COMPLETED, 'driver', driverId);
      this.logger.log(`WhatsApp driver ${driverId} completed trip ${tripId}`);
    } catch (error) {
      this.logger.error(`Failed to complete trip: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}
