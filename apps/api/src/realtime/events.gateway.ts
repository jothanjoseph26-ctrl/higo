import { Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
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
  DriverArrivedAtPickupPayload,
  DriverTripStartedPayload,
  DriverTripCompletedPayload,
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
export class EventsGateway implements OnGatewayInit, OnGatewayConnection {
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
          status: { in: ['requested', 'matched', 'en_route', 'active'] },
        },
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
      });
      if (driver?.isOnline && driver.currentLocation) {
        // Restore Redis presence
        const rawLoc = driver.currentLocation as any;
        const coords = rawLoc?.coordinates ?? [0, 0];
        await this.presenceService.setDriverOnline(userId, coords[1], coords[0]);
      }

      // Look for active trip
      const activeTrip = await this.prisma.trip.findFirst({
        where: {
          driverId: userId,
          status: { in: ['matched', 'en_route', 'active'] },
        },
      });
      if (activeTrip) {
        this.roomService.joinTrip(client, activeTrip.id);
        this.logger.log(`Driver ${userId} re-joined trip room: ${activeTrip.id}`);
      }
    } else if (type === 'admin') {
      this.roomService.joinAdmin(client);
    }
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
      if (trip && ['matched', 'en_route', 'active'].includes(trip.status)) {
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

    await this.matchingService.acceptOffer(driverId, payload.tripId);
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

  @SubscribeMessage(SOCKET_EVENTS.DRIVER_ARRIVED_AT_PICKUP)
  async handleArrivedAtPickup(
    @ConnectedSocket() client: AppSocket,
    @MessageBody() payload: DriverArrivedAtPickupPayload,
  ): Promise<void> {
    const driverId = client.data.sub;
    if (client.data.type !== 'driver') return;

    this.logger.log(`Driver ${driverId} arrived at pickup for trip ${payload.tripId}`);
    await this.tripService.transition(payload.tripId, TripStatus.EN_ROUTE, 'driver');
  }

  @SubscribeMessage(SOCKET_EVENTS.DRIVER_TRIP_STARTED)
  async handleTripStarted(
    @ConnectedSocket() client: AppSocket,
    @MessageBody() payload: DriverTripStartedPayload,
  ): Promise<void> {
    const driverId = client.data.sub;
    if (client.data.type !== 'driver') return;

    this.logger.log(`Driver ${driverId} started ride for trip ${payload.tripId}`);
    await this.tripService.transition(payload.tripId, TripStatus.ACTIVE, 'driver');
  }

  @SubscribeMessage(SOCKET_EVENTS.DRIVER_TRIP_COMPLETED)
  async handleTripCompleted(
    @ConnectedSocket() client: AppSocket,
    @MessageBody() payload: DriverTripCompletedPayload,
  ): Promise<void> {
    const driverId = client.data.sub;
    if (client.data.type !== 'driver') return;

    this.logger.log(`Driver ${driverId} completed ride for trip ${payload.tripId}`);
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