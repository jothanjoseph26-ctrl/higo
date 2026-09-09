import { Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  SOCKET_EVENTS,
  SocketAuthData,
  DriverLocationUpdatePayload,
  DriverGoOnlinePayload,
  DriverGoOfflinePayload,
  DriverTripAcceptPayload,
  DriverTripDeclinePayload,
  DriverCounterFarePayload,
  DriverArrivedAtPickupPayload,
  DriverTripStartedPayload,
  DriverTripCompletedPayload,
  PassengerCounterAcceptPayload,
  PassengerCounterDeclinePayload,
  LatLng,
  TripMessage,
  TripStatus,
  TripMessageNewPayload,
} from '@higo/shared-types';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { PresenceService } from './presence.service';
import { RoomService } from './room.service';
import { TripService } from '../trips/trips.service';
import { MatchingService } from '../matching/matching.service';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents> & {
  data: SocketAuthData;
};

@WebSocketGateway({ cors: true, namespace: '/' })
export class EventsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server!: Server<ClientToServerEvents, ServerToClientEvents>;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly presenceService: PresenceService,
    private readonly roomService: RoomService,
    @Inject(forwardRef(() => TripService))
    private readonly tripService: TripService,
    @Inject(forwardRef(() => MatchingService))
    private readonly matchingService: MatchingService,
  ) {}

  afterInit(server: any): void {
    try {
      const redisUrl = this.config.getOrThrow<string>('REDIS_URL');
      const pubClient = new Redis(redisUrl);
      const subClient = pubClient.duplicate();

      pubClient.on('error', (err) => {
        this.logger.error('Socket.IO Redis pub client error', err);
      });
      subClient.on('error', (err) => {
        this.logger.error('Socket.IO Redis sub client error', err);
      });

      if (typeof server.adapter === 'function') {
        server.adapter(createAdapter(pubClient, subClient));
        this.logger.log('Socket.IO Redis adapter enabled');
      } else {
        this.logger.warn('Socket.IO server.adapter not available — running without Redis adapter');
      }
    } catch (err) {
      this.logger.warn(`Redis adapter setup skipped: ${err instanceof Error ? err.message : err}`);
    }

    server.use(async (socket, next) => {
      try {
        const token =
          (socket.handshake.auth?.token as string | undefined) ??
          this.extractBearer(socket.handshake.headers.authorization);
        if (!token) {
          socket.emit(SOCKET_EVENTS.AUTH_ERROR, { message: 'Missing token' });
          return next(new Error('Unauthorized'));
        }

        const payload = await this.jwt.verifyAsync<SocketAuthData>(token, {
          secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        });

        (socket as AppSocket).data = {
          sub: payload.sub,
          type: payload.type,
          role: payload.role,
        };
        next();
      } catch {
        socket.emit(SOCKET_EVENTS.AUTH_ERROR, { message: 'Invalid token' });
        next(new Error('Unauthorized'));
      }
    });
  }

  async handleConnection(client: AppSocket): Promise<void> {
    const userId = client.data.sub;
    const type = client.data.type;

    this.logger.log(`Socket connected: ${client.id} user=${userId} type=${type}`);

    // Reconnection room join & state synchronization
    if (type === 'passenger') {
      this.roomService.joinPassenger(client, userId);
      
      // Look for active trip
      const activeTrip = await this.prisma.trip.findFirst({
        where: {
          passengerId: userId,
          status: { in: ['requested', 'matched', 'arrived', 'active'] },
        },
        select: { id: true },
      });
      if (activeTrip) {
        this.roomService.joinTrip(client, activeTrip.id);
        this.logger.log(`Passenger ${userId} re-joined trip room: ${activeTrip.id}`);
      }
    } else if (type === 'driver') {
      this.roomService.joinDriver(client, userId);

      // Check if online in database
      const driver = await this.prisma.driver.findUnique({
        where: { id: userId },
        select: { isOnline: true },
      });
      if (driver?.isOnline) {
        try {
          const locRows = await this.prisma.$queryRaw<any[]>`SELECT ST_AsGeoJSON(current_location) as geo FROM drivers WHERE id = ${userId}::uuid`;
          const geo = locRows[0]?.geo ? JSON.parse(locRows[0].geo) : null;
          const coords = geo?.coordinates;
          if (coords) await this.presenceService.setDriverOnline(userId, coords[1], coords[0]);
        } catch {}
      }

      // Look for active trip
      const activeTrip = await this.prisma.trip.findFirst({
        where: {
          driverId: userId,
          status: { in: ['matched', 'arrived', 'active'] },
        },
        select: { id: true },
      });
      if (activeTrip) {
        this.roomService.joinTrip(client, activeTrip.id);
        this.logger.log(`Driver ${userId} re-joined trip room: ${activeTrip.id}`);
      }

      // Re-emit any pending ride offers the driver missed while disconnected
      try {
        await this.matchingService.checkPendingOffers(userId);
      } catch (err) {
        this.logger.warn(`checkPendingOffers failed for ${userId}: ${err}`);
      }
    } else if (type === 'admin') {
      this.roomService.joinAdmin(client);
    }
  }

  async getDriverSocketCount(driverId: string): Promise<number> {
    try {
      const sockets = await this.server.in(`driver:${driverId}`).fetchSockets();
      return sockets.length;
    } catch {
      return 0;
    }
  }

  async handleDisconnect(client: AppSocket): Promise<void> {
    const userId = client.data.sub;
    const type = client.data.type;
    this.logger.log(`Socket disconnected: ${client.id} user=${userId} type=${type}`);
    // Do NOT cancel trips or change driver online status on disconnect.
    // The driver's Redis presence key has a 5-min TTL and will expire naturally.
    // The trip remains in its current state — the driver can reconnect and resume.
  }

  @SubscribeMessage(SOCKET_EVENTS.DRIVER_GO_ONLINE)
  async handleGoOnline(
    @ConnectedSocket() client: AppSocket,
    @MessageBody() payload: DriverGoOnlinePayload,
  ): Promise<void> {
    const driverId = client.data.sub;
    if (client.data.type !== 'driver') return;

    this.logger.log(`Driver ${driverId} going online`);
    await this.prisma.driver.update({
      where: { id: driverId },
      data: { isOnline: true },
    });

    await this.presenceService.setDriverOnline(driverId, payload.lat, payload.lng);
    this.roomService.joinDriver(client, driverId);
  }

  @SubscribeMessage(SOCKET_EVENTS.DRIVER_GO_OFFLINE)
  async handleGoOffline(@ConnectedSocket() client: AppSocket): Promise<void> {
    const driverId = client.data.sub;
    if (client.data.type !== 'driver') return;

    this.logger.log(`Driver ${driverId} going offline`);
    await this.prisma.driver.update({
      where: { id: driverId },
      data: { isOnline: false },
    });

    await this.presenceService.setDriverOffline(driverId);
    this.roomService.leaveDriver(client, driverId);
  }

  @SubscribeMessage(SOCKET_EVENTS.DRIVER_LOCATION_UPDATE)
  async handleLocationUpdate(
    @ConnectedSocket() client: AppSocket,
    @MessageBody() payload: DriverLocationUpdatePayload,
  ): Promise<void> {
    const driverId = client.data.sub;
    if (client.data.type !== 'driver') return;

    await this.presenceService.updateDriverLocation(
      driverId,
      payload.lat,
      payload.lng,
      payload.bearing,
      payload.speed,
    );

    // Fan-out to admin dashboard
    this.server.to('admin:ops').emit(SOCKET_EVENTS.TRIP_DRIVER_LOCATION as any, {
      driverId,
      lat: payload.lat,
      lng: payload.lng,
      bearing: payload.bearing,
    });

    // If bound to a trip, compute and broadcast live ETA
    if (payload.tripId) {
      const trip = await this.tripService.getTrip(payload.tripId);
      if (trip && ['matched', 'arrived', 'active'].includes(trip.status)) {
        const target = trip.status === 'active' ? trip.destinationLocation : trip.pickupLocation;
        const distanceKm = this.haversineDistance({ lat: payload.lat, lng: payload.lng }, target);
        const eta = Math.max(1, Math.round(distanceKm * 2.5));

        const broadcastPayload = {
          tripId: payload.tripId,
          lat: payload.lat,
          lng: payload.lng,
          bearing: payload.bearing,
          eta,
        };

        this.server.to(`trip:${payload.tripId}`).emit(
          SOCKET_EVENTS.TRIP_DRIVER_LOCATION,
          broadcastPayload,
        );
      }
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.DRIVER_TRIP_ACCEPT)
  async handleTripAccept(
    @ConnectedSocket() client: AppSocket,
    @MessageBody() payload: DriverTripAcceptPayload,
  ): Promise<void> {
    const driverId = client.data.sub;
    if (client.data.type !== 'driver') return;

    this.logger.log(`Driver ${driverId} accepted trip ${payload.tripId}`);
    
    // Join the driver to the trip room immediately
    this.roomService.joinTrip(client, payload.tripId);

    // Join passenger to the trip room as well
    const trip = await this.prisma.trip.findUnique({
      where: { id: payload.tripId },
    });
    if (trip) {
      const passengerSockets = await this.server.in(`passenger:${trip.passengerId}`).fetchSockets();
      for (const pSock of passengerSockets) {
        pSock.join(`trip:${payload.tripId}`);
      }
    }

    // A failed accept used to throw into the void: the driver's screen had
    // already moved on and the passenger was never told, so both sides sat
    // waiting. Tell the driver so the UI can recover.
    try {
      await this.matchingService.acceptOffer(driverId, payload.tripId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Accept failed';
      this.logger.warn(
        `Driver ${driverId} failed to accept trip ${payload.tripId}: ${message}`,
      );
      client.emit(SOCKET_EVENTS.DRIVER_TRIP_ACCEPT_FAILED, {
        tripId: payload.tripId,
        reason: message,
      });
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.DRIVER_TRIP_DECLINE)
  async handleTripDecline(
    @ConnectedSocket() client: AppSocket,
    @MessageBody() payload: DriverTripDeclinePayload,
  ): Promise<void> {
    const driverId = client.data.sub;
    if (client.data.type !== 'driver') return;

    this.logger.log(`Driver ${driverId} declined trip ${payload.tripId} (Reason: ${payload.reason})`);
    await this.matchingService.declineOffer(driverId, payload.tripId, payload.reason);
  }

  @SubscribeMessage(SOCKET_EVENTS.DRIVER_COUNTER_FARE)
  async handleCounterFare(
    @ConnectedSocket() client: AppSocket,
    @MessageBody() payload: DriverCounterFarePayload,
  ): Promise<void> {
    const driverId = client.data.sub;
    if (client.data.type !== 'driver') return;

    this.logger.log(`Driver ${driverId} counter-fare ₦${payload.counterFare} on trip ${payload.tripId}`);

    // Get trip and driver info
    const trip = await this.tripService.getTrip(payload.tripId);
    if (!trip) {
      client.emit(SOCKET_EVENTS.DRIVER_TRIP_ACCEPT_FAILED, {
        tripId: payload.tripId,
        reason: 'Trip not found',
      });
      return;
    }

    // Cancel timeout job via matching service
    try {
      await this.matchingService.sendCounterFare(driverId, payload.tripId, payload.counterFare);
    } catch (err) {
      client.emit(SOCKET_EVENTS.DRIVER_TRIP_ACCEPT_FAILED, {
        tripId: payload.tripId,
        reason: err instanceof Error ? err.message : 'Counter-fare failed',
      });
      return;
    }

    // Get driver name
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId }, select: { name: true } });

    // Store counter-fare + assign driver to the trip
    await this.prisma.trip.update({
      where: { id: payload.tripId },
      data: { driverCounterFare: payload.counterFare, driverId: driverId },
    });

    // Emit counter-fare to passenger
    this.server.to(`passenger:${trip.passengerId}`).emit(SOCKET_EVENTS.TRIP_COUNTER_FARE, {
      tripId: payload.tripId,
      driverId,
      driverName: driver?.name || 'Your driver',
      counterFare: payload.counterFare,
      originalFare: trip.totalFare,
    });

    this.logger.log(`Counter-fare ₦${payload.counterFare} sent to passenger ${trip.passengerId} for trip ${payload.tripId}`);
  }

  @SubscribeMessage(SOCKET_EVENTS.DRIVER_ARRIVED_AT_PICKUP)
  async handleArrivedAtPickup(
    @ConnectedSocket() client: AppSocket,
    @MessageBody() payload: DriverArrivedAtPickupPayload,
  ): Promise<void> {
    const driverId = client.data.sub;
    if (client.data.type !== 'driver') return;

    this.logger.log(`Driver ${driverId} arrived at pickup for trip ${payload.tripId}`);
    try {
      // GPS validation: verify driver is near pickup
      const trip = await this.tripService.getTrip(payload.tripId);
      if (trip && trip.pickupLocation) {
        const driverLocation = await this.presenceService.getDriverLocation(driverId);
        if (driverLocation) {
          const distance = this.haversineDistance(
            { lat: driverLocation.lat, lng: driverLocation.lng },
            trip.pickupLocation as any,
          );
          if (distance > 0.5) { // 500m radius
            this.logger.warn(
              `Driver ${driverId} arrival rejected: ${distance.toFixed(2)}km from pickup (max 0.5km)`,
            );
            client.emit(SOCKET_EVENTS.DRIVER_TRIP_ACCEPT_FAILED, {
              tripId: payload.tripId,
              reason: `You are ${distance.toFixed(1)}km from the pickup location. Please move closer.`,
            });
            return;
          }
        }
      }
      await this.tripService.transition(payload.tripId, TripStatus.ARRIVED, 'driver');
    } catch (error) {
      this.logger.warn(
        `Driver ${driverId} failed to transition to arrived for trip ${payload.tripId}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.DRIVER_TRIP_STARTED)
  async handleTripStarted(
    @ConnectedSocket() client: AppSocket,
    @MessageBody() payload: DriverTripStartedPayload,
  ): Promise<void> {
    const driverId = client.data.sub;
    if (client.data.type !== 'driver') return;

    this.logger.log(`Driver ${driverId} started ride for trip ${payload.tripId}`);
    try {
      // GPS validation: verify driver is near pickup (within 200m)
      const trip = await this.tripService.getTrip(payload.tripId);
      if (trip && trip.pickupLocation) {
        const driverLocation = await this.presenceService.getDriverLocation(driverId);
        if (driverLocation) {
          const distance = this.haversineDistance(
            { lat: driverLocation.lat, lng: driverLocation.lng },
            trip.pickupLocation as any,
          );
          if (distance > 0.5) { // 500m radius
            this.logger.warn(
              `Driver ${driverId} start rejected: ${distance.toFixed(2)}km from pickup (max 0.5km)`,
            );
            client.emit(SOCKET_EVENTS.DRIVER_TRIP_ACCEPT_FAILED, {
              tripId: payload.tripId,
              reason: `Cannot start trip: ${distance.toFixed(1)}km from pickup location. Please be at the pickup.`,
            });
            return;
          }
        }
      }
      await this.tripService.transition(payload.tripId, TripStatus.ACTIVE, 'driver');
    } catch (error) {
      this.logger.warn(
        `Driver ${driverId} failed to start trip ${payload.tripId}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.DRIVER_TRIP_COMPLETED)
  async handleTripCompleted(
    @ConnectedSocket() client: AppSocket,
    @MessageBody() payload: DriverTripCompletedPayload,
  ): Promise<void> {
    const driverId = client.data.sub;
    if (client.data.type !== 'driver') return;

    this.logger.log(`Driver ${driverId} completed ride for trip ${payload.tripId}`);
    try {
      const trip = await this.tripService.transition(payload.tripId, TripStatus.COMPLETED, 'driver');

      // Remove passenger and driver from trip room
      client.leave(`trip:${payload.tripId}`);
      const tripPrisma = await this.prisma.trip.findUnique({
        where: { id: payload.tripId },
      });
      if (tripPrisma) {
        const passengerSockets = await this.server.in(`passenger:${tripPrisma.passengerId}`).fetchSockets();
        for (const pSock of passengerSockets) {
          pSock.leave(`trip:${payload.tripId}`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Completion failed';
      this.logger.warn(
        `Driver ${driverId} failed to complete trip ${payload.tripId}: ${message}`,
      );
      client.emit(SOCKET_EVENTS.DRIVER_TRIP_ACCEPT_FAILED, {
        tripId: payload.tripId,
        reason: `Trip completion failed: ${message}`,
      });
    }
  }

  @SubscribeMessage(SOCKET_EVENTS.PASSENGER_COUNTER_ACCEPT)
  async handleCounterAccept(
    @ConnectedSocket() client: AppSocket,
    @MessageBody() payload: PassengerCounterAcceptPayload,
  ): Promise<void> {
    const passengerId = client.data.sub;
    if (client.data.type !== 'passenger') return;

    const trip = await this.tripService.getTrip(payload.tripId);
    if (!trip || trip.passengerId !== passengerId) return;

    // Get the counter-fare from the trip record
    const counterFare = (trip as any).driverCounterFare;
    if (!counterFare) {
      this.logger.warn(`No counter-fare found for trip ${payload.tripId}`);
      return;
    }

    // The trip must still be in "requested" status and have a driverId (set when counter-fare was sent)
    if (!trip.driverId) {
      this.logger.warn(`Trip ${payload.tripId} has no driverId for counter-fare accept`);
      return;
    }

    const driverId = trip.driverId;

    // Update fare + match the trip to this driver (same as acceptOffer logic)
    await this.prisma.trip.update({
      where: { id: payload.tripId },
      data: { totalFare: counterFare, driverCounterFare: null },
    });

    // Transition trip to MATCHED
    await this.tripService.transition(payload.tripId, TripStatus.MATCHED, 'driver', driverId);

    // Cancel other offers
    await this.matchingService.cancelOtherOffersForTrip(payload.tripId, driverId);

    // Get driver details for passenger
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      select: { name: true, phone: true, vehiclePlate: true, vehicleModel: true, ratingAvg: true, vehicleType: true },
    });

    const passenger = await this.prisma.user.findUnique({
      where: { id: passengerId },
      select: { name: true },
    });

    // Emit TRIP_MATCHED to passenger
    this.server.to(`passenger:${passengerId}`).emit(SOCKET_EVENTS.TRIP_MATCHED, {
      tripId: payload.tripId,
      driverId,
      driverDetails: {
        name: driver?.name || 'Driver',
        phone: driver?.phone || null,
        avatarUrl: null,
        vehiclePlate: driver?.vehiclePlate || null,
        vehicleModel: driver?.vehicleModel || null,
        ratingAvg: driver?.ratingAvg != null ? Number(driver.ratingAvg) : 5.0,
      },
      eta: 5,
    });

    // Emit TRIP_COUNTER_ACCEPTED to driver
    this.server.to(`driver:${driverId}`).emit(SOCKET_EVENTS.TRIP_COUNTER_ACCEPTED, {
      tripId: payload.tripId,
      finalFare: counterFare,
    });

    this.logger.log(`Passenger ${passengerId} accepted counter-fare ₦${counterFare} for trip ${payload.tripId}, matched to driver ${driverId}`);
  }

  @SubscribeMessage(SOCKET_EVENTS.PASSENGER_COUNTER_DECLINE)
  async handleCounterDecline(
    @ConnectedSocket() client: AppSocket,
    @MessageBody() payload: PassengerCounterDeclinePayload,
  ): Promise<void> {
    const passengerId = client.data.sub;
    if (client.data.type !== 'passenger') return;

    const trip = await this.tripService.getTrip(payload.tripId);
    if (!trip || trip.passengerId !== passengerId) return;

    const declinedDriverId = trip.driverId;

    // Clear the counter-fare and reset driverId (driver was never matched)
    await this.prisma.trip.update({
      where: { id: payload.tripId },
      data: { driverCounterFare: null, driverId: null },
    });

    // Notify driver
    if (declinedDriverId) {
      this.server.to(`driver:${declinedDriverId}`).emit(SOCKET_EVENTS.TRIP_COUNTER_DECLINED, {
        tripId: payload.tripId,
      });

      // Re-dispatch: remove declined driver from offered set and dispatch again
      await this.matchingService.dispatchIfNoActiveOffersPublic(payload.tripId, declinedDriverId);
    }

    this.logger.log(`Passenger ${passengerId} declined counter-fare for trip ${payload.tripId}`);
  }

  emitTripMessageNew(tripId: string, message: TripMessage): void {
    const payload: TripMessageNewPayload = {
      tripId,
      message,
    };
    this.server
      .to(`trip:${tripId}`)
      .emit(SOCKET_EVENTS.MESSAGE_NEW, payload);
  }

  private extractBearer(header?: string): string | undefined {
    if (!header?.startsWith('Bearer ')) {
      return undefined;
    }
    return header.slice(7);
  }

  private haversineDistance(p1: LatLng, p2: LatLng): number {
    const R = 6371;
    const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
    const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((p1.lat * Math.PI) / 180) *
        Math.cos((p2.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}
