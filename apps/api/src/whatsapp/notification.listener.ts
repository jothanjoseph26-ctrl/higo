import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from './whatsapp.service';
import { NavigationService } from './navigation.service';
import { WhatsAppAnalytics } from './analytics.service';
import {
  TripRequested,
  DriverMatched,
  DriverArrived,
  TripStarted,
  TripCompleted,
  TripCancelled,
  NoDriversAvailable,
} from '../trips/trip.events';
import { ConversationState } from './whatsapp.types';

@Injectable()
export class WhatsAppNotificationListener {
  private readonly logger = new Logger(WhatsAppNotificationListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappService: WhatsAppService,
    private readonly navigationService: NavigationService,
    private readonly analytics: WhatsAppAnalytics,
  ) {}

  @OnEvent('trip.requested')
  async handleTripRequested(event: TripRequested): Promise<void> {
    if (event.source !== 'whatsapp') return;

    const conversation = await this.findConversationByUserId(event.passengerId);
    if (!conversation) return;

    try {
      await this.whatsappService.sendMessage(
        await this.getPhoneNumberId(),
        conversation.whatsappPhone,
        `🔍 Searching for a driver...\n\n📍 Pickup: ${event.pickup.address}\n🏁 Destination: ${event.destination.address}\n💰 Fare: ₦${event.totalFare.toLocaleString()}`,
        await this.getAccessToken(),
      );

      await this.prisma.whatsAppConversation.update({
        where: { id: conversation.id },
        data: {
          activeTripId: event.tripId,
          conversationState: ConversationState.WAITING_FOR_MATCH,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to send trip.requested notification: ${error.message}`);
    }

    // Also notify online WhatsApp drivers
    await this.notifyOnlineDrivers(event);

    void this.analytics.track('driver_search_started', conversation.id);
  }

  @OnEvent('payment.confirmed')
  async handlePaymentConfirmed(event: { tripId: string; amount: number }): Promise<void> {
    const conversation = await this.findConversationByTripId(event.tripId, 'passenger');
    if (!conversation) return;

    try {
      await this.whatsappService.sendMessage(
        await this.getPhoneNumberId(),
        conversation.whatsappPhone,
        `✅ Payment confirmed!\n\n💰 ₦${event.amount.toLocaleString()} received.\n\n🔍 Searching for a driver...`,
        await this.getAccessToken(),
      );
    } catch (error) {
      this.logger.error(`Failed to send payment confirmation: ${error.message}`);
    }
  }

  @OnEvent('driver.matched')
  async handleDriverMatched(event: DriverMatched): Promise<void> {
    // Notify passenger
    const passengerConversation = await this.findConversationByTripId(event.tripId, 'passenger');
    if (passengerConversation) {
      try {
        await this.whatsappService.sendMessage(
          await this.getPhoneNumberId(),
          passengerConversation.whatsappPhone,
          `✅ Driver found!\n\n` +
          `👤 ${event.driverName}\n` +
          `🚗 ${event.driverVehicle || 'Vehicle'}\n` +
          `🔢 ${event.driverPlate || 'N/A'}\n` +
          `⏱️ ETA: ~${event.etaMinutes || '?'} min\n\n` +
          `Your driver is on the way!`,
          await this.getAccessToken(),
        );

        await this.prisma.whatsAppConversation.update({
          where: { id: passengerConversation.id },
          data: { conversationState: ConversationState.TRIP_ACTIVE },
        });

        void this.analytics.track('driver_matched', passengerConversation.id);
      } catch (error) {
        this.logger.error(`Failed to send driver.matched to passenger: ${error.message}`);
      }
    }

    // Notify driver (if they have WhatsApp) with navigation links
    const driverConversation = await this.findConversationByDriverId(event.driverId);
    if (driverConversation) {
      try {
        // Build navigation-rich message using trip data
        const trip = await this.prisma.trip.findUnique({ where: { id: event.tripId } });
        let message = `📋 New ride assigned!\n\nPickup: (check your app for details)`;

        if (trip) {
          try {
            const pickupGeo = JSON.parse(trip.pickupLocationGeoJson || '{}');
            const destGeo = JSON.parse(trip.destinationLocationGeoJson || '{}');
            const pickup = { lat: pickupGeo.coordinates?.[1], lng: pickupGeo.coordinates?.[0] };
            const dest = { lat: destGeo.coordinates?.[1], lng: destGeo.coordinates?.[0] };

            if (pickup.lat && dest.lat) {
              message = this.navigationService.tripSummaryWithNav({
                pickupAddress: trip.pickupAddress,
                pickupLat: pickup.lat,
                pickupLng: pickup.lng,
                destAddress: trip.destinationAddress,
                destLat: dest.lat,
                destLng: dest.lng,
                fare: trip.totalFare || 0,
                vehicleType: trip.vehicleType,
              });
            }
          } catch {
            // GeoJSON parse failed — use simple message
          }
        }

        await this.whatsappService.sendMessage(
          await this.getPhoneNumberId(),
          driverConversation.whatsappPhone,
          message,
          await this.getAccessToken(),
        );
      } catch (error) {
        this.logger.error(`Failed to send driver.matched to driver: ${error.message}`);
      }
    }
  }

  @OnEvent('driver.arrived')
  async handleDriverArrived(event: DriverArrived): Promise<void> {
    const conversation = await this.findConversationByTripId(event.tripId, 'passenger');
    if (!conversation) return;

    try {
      await this.whatsappService.sendMessage(
        await this.getPhoneNumberId(),
        conversation.whatsappPhone,
        `📍 Your driver has arrived at the pickup!\n\nPlease look for your driver.`,
        await this.getAccessToken(),
      );
    } catch (error) {
      this.logger.error(`Failed to send driver.arrived: ${error.message}`);
    }
  }

  @OnEvent('trip.started')
  async handleTripStarted(event: TripStarted): Promise<void> {
    const conversation = await this.findConversationByTripId(event.tripId, 'passenger');
    if (!conversation) return;

    try {
      await this.whatsappService.sendMessage(
        await this.getPhoneNumberId(),
        conversation.whatsappPhone,
        `🚗 Trip started!\n\nHave a safe journey! 🛣️`,
        await this.getAccessToken(),
      );
      void this.analytics.track('trip_started', conversation.id);
    } catch (error) {
      this.logger.error(`Failed to send trip.started: ${error.message}`);
    }
  }

  @OnEvent('trip.completed')
  async handleTripCompleted(event: TripCompleted): Promise<void> {
    const conversation = await this.findConversationByTripId(event.tripId, 'passenger');
    if (!conversation) return;

    try {
      await this.whatsappService.sendMessage(
        await this.getPhoneNumberId(),
        conversation.whatsappPhone,
        `✅ Trip completed!\n\n💰 Total fare: ₦${event.totalFare.toLocaleString()}\n💳 Payment: ${event.paymentMethod}\n\n` +
        `⭐ How was your ride? Rate 1-5:`,
        await this.getAccessToken(),
      );

      await this.prisma.whatsAppConversation.update({
        where: { id: conversation.id },
        data: {
          conversationState: ConversationState.AWAITING_RATING,
          activeTripId: null,
        },
      });

      void this.analytics.track('trip_completed', conversation.id);
    } catch (error) {
      this.logger.error(`Failed to send trip.completed: ${error.message}`);
    }
  }

  @OnEvent('trip.cancelled')
  async handleTripCancelled(event: TripCancelled): Promise<void> {
    const conversation = await this.findConversationByTripId(event.tripId, 'passenger');
    if (!conversation) return;

    try {
      const reason = event.cancelledBy === 'system'
        ? 'The trip was cancelled automatically.'
        : event.cancelledBy === 'driver'
          ? 'Your driver cancelled the trip.'
          : 'Trip cancelled.';

      await this.whatsappService.sendMessage(
        await this.getPhoneNumberId(),
        conversation.whatsappPhone,
        `❌ ${reason}\n\nType "menu" to book another ride.`,
        await this.getAccessToken(),
      );

      await this.prisma.whatsAppConversation.update({
        where: { id: conversation.id },
        data: {
          conversationState: ConversationState.IDLE,
          activeTripId: null,
          activeBooking: null,
        },
      });

      void this.analytics.track('trip_cancelled', conversation.id);
    } catch (error) {
      this.logger.error(`Failed to send trip.cancelled: ${error.message}`);
    }
  }

  @OnEvent('trip.no_drivers_available')
  async handleNoDriversAvailable(event: NoDriversAvailable): Promise<void> {
    const conversation = await this.findConversationByTripId(event.tripId, 'passenger');
    if (!conversation) return;

    try {
      await this.whatsappService.sendButtonsMessage(
        await this.getPhoneNumberId(),
        conversation.whatsappPhone,
        `😔 No drivers available right now.`,
        [
          { id: 'try_again', title: '🔄 Try Again' },
          { id: 'book_ride', title: '🚕 New Ride' },
          { id: 'cancel', title: '❌ Cancel' },
        ],
        await this.getAccessToken(),
      );

      await this.prisma.whatsAppConversation.update({
        where: { id: conversation.id },
        data: {
          conversationState: ConversationState.IDLE,
          activeTripId: null,
          activeBooking: null,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to send no_drivers_available: ${error.message}`);
    }
  }

  // ─── HELPER METHODS ──────────────────────────────────────────────

  private async findConversationByUserId(userId: string) {
    return this.prisma.whatsAppConversation.findFirst({
      where: { userId, isActive: true },
    });
  }

  private async findConversationByDriverId(driverId: string) {
    return this.prisma.whatsAppConversation.findFirst({
      where: { driverId, isActive: true },
    });
  }

  private async findConversationByTripId(tripId: string, role: 'passenger' | 'driver') {
    return this.prisma.whatsAppConversation.findFirst({
      where: { activeTripId: tripId, role, isActive: true },
    });
  }

  private async getPhoneNumberId(): Promise<string> {
    const config = await this.prisma.whatsAppConfig.findFirst({ where: { isActive: true } });
    return config?.phoneNumberId || '';
  }

  private async getAccessToken(): Promise<string> {
    const config = await this.prisma.whatsAppConfig.findFirst({ where: { isActive: true } });
    return config?.accessToken || '';
  }

  private async notifyOnlineDrivers(event: TripRequested): Promise<void> {
    const onlineDrivers = await this.prisma.whatsAppConversation.findMany({
      where: {
        role: 'driver',
        conversationState: ConversationState.DRIVER_ONLINE,
        isActive: true,
      },
    });

    for (const driver of onlineDrivers) {
      if (!driver.driverId) continue;

      try {
        const navUrl = this.navigationService.toPickup(event.pickup.lat, event.pickup.lng);
        await this.whatsappService.sendButtonsMessage(
          await this.getPhoneNumberId(),
          driver.whatsappPhone,
          `🚨 New Ride Request!\n\n` +
          `📍 Pickup: ${event.pickup.address}\n` +
          `🏁 Destination: ${event.destination.address}\n` +
          `💰 Fare: ₦${event.totalFare.toLocaleString()}\n\n` +
          `🗺️ Navigate: ${navUrl}`,
          [
            { id: 'accept_trip', title: '✅ Accept' },
            { id: 'decline_trip', title: '❌ Decline' },
          ],
          await this.getAccessToken(),
        );

        await this.prisma.whatsAppConversation.update({
          where: { id: driver.id },
          data: {
            conversationState: ConversationState.DRIVER_INCOMING_REQUEST,
            activeTripId: event.tripId,
          },
        });
      } catch (error) {
        this.logger.error(`Failed to notify driver ${driver.id}: ${error.message}`);
      }
    }
  }
}
