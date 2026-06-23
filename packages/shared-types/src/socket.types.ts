/**
 * HiGo Abuja — Shared WebSocket Event Types
 * Package: @higo/shared-types
 *
 * Socket.io namespace: '/' with JWT auth middleware.
 * Rooms: driver:{id}, passenger:{id}, trip:{id}, admin:ops
 *
 * Use SOCKET_EVENTS constants everywhere — never inline event-name strings.
 */

import { LatLng, UUID, Kobo, MatchedDriverDetails } from './domain.types';

// ============================================================================
// EVENT NAME CONSTANTS
// ============================================================================

export const SOCKET_EVENTS = {
  // ---- Client -> Server (driver) ----
  DRIVER_LOCATION_UPDATE: 'driver:location_update',
  DRIVER_GO_ONLINE: 'driver:go_online',
  DRIVER_GO_OFFLINE: 'driver:go_offline',
  DRIVER_TRIP_ACCEPT: 'driver:trip_accept',
  DRIVER_TRIP_DECLINE: 'driver:trip_decline',
  DRIVER_ARRIVED_AT_PICKUP: 'driver:arrived_at_pickup',
  DRIVER_TRIP_STARTED: 'driver:trip_started',
  DRIVER_TRIP_COMPLETED: 'driver:trip_completed',

  // ---- Server -> Client (trip lifecycle) ----
  TRIP_NEW_REQUEST: 'trip:new_request',
  TRIP_MATCHED: 'trip:matched',
  TRIP_NO_DRIVERS_AVAILABLE: 'trip:no_drivers_available',
  TRIP_DRIVER_LOCATION: 'trip:driver_location',
  TRIP_DRIVER_ARRIVED: 'trip:driver_arrived',
  TRIP_STARTED: 'trip:started',
  TRIP_COMPLETED: 'trip:completed',
  TRIP_CANCELLED: 'trip:cancelled',

  // ---- Server -> Client (general) ----
  NOTIFICATION_GENERAL: 'notification:general',

  // ---- Connection lifecycle (Socket.io reserved-style, app-level) ----
  CONNECT_ERROR: 'connect_error',
  AUTH_ERROR: 'auth:error',
} as const;

export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];

// ============================================================================
// CLIENT -> SERVER PAYLOADS
// ============================================================================

export interface DriverLocationUpdatePayload {
  lat: number;
  lng: number;
  bearing?: number;
  speed?: number;
  /** Optional: bound to a trip while active so server can fan-out to trip room. */
  tripId?: UUID;
}

export interface DriverGoOnlinePayload {
  /** Initial location at the moment of going online. */
  lat: number;
  lng: number;
}

export type DriverGoOfflinePayload = Record<string, never>;

export interface DriverTripAcceptPayload {
  tripId: UUID;
}

export interface DriverTripDeclinePayload {
  tripId: UUID;
  reason: 'manual' | 'timeout' | 'too_far' | 'restricted_zone' | string;
}

export interface DriverArrivedAtPickupPayload {
  tripId: UUID;
}

export interface DriverTripStartedPayload {
  tripId: UUID;
}

export interface DriverTripCompletedPayload {
  tripId: UUID;
  /** Driver-reported final location (server recomputes authoritative fare). */
  finalLocation?: LatLng;
}

// ============================================================================
// SERVER -> CLIENT PAYLOADS
// ============================================================================

export interface TripNewRequestPayload {
  tripId: UUID;
  pickup: LatLng;
  pickupAddress: string;
  destination: LatLng;
  destinationAddress: string;
  fare: Kobo;
  surgeMultiplier: number;
  distanceKm: number;
  durationMin: number;
  passengerId: UUID;
  passengerName: string | null;
  passengerRating: number;
  /** Seconds the driver has to accept before auto-decline (15). */
  expiresInSeconds: number;
}

export interface TripMatchedPayload {
  tripId: UUID;
  driverId: UUID;
  driverDetails: MatchedDriverDetails;
  /** ETA to pickup in minutes. */
  eta: number;
}

export interface TripNoDriversAvailablePayload {
  tripId: UUID;
}

export interface TripDriverLocationPayload {
  tripId: UUID;
  lat: number;
  lng: number;
  bearing?: number;
  /** Live ETA recalculated server-side, minutes. */
  eta: number;
}

export interface TripDriverArrivedPayload {
  tripId: UUID;
}

export interface TripStartedPayload {
  tripId: UUID;
  startedAt: string; // ISO
}

export interface TripCompletedPayload {
  tripId: UUID;
  fare: Kobo;
  paymentRef: string | null;
  completedAt: string; // ISO
}

export interface TripCancelledPayload {
  tripId: UUID;
  reason: string;
  cancelledBy: 'passenger' | 'driver' | 'system';
}

export interface NotificationGeneralPayload {
  title: string;
  body: string;
  type: string;
  data?: Record<string, unknown>;
}

// ============================================================================
// TYPED EVENT MAPS (for socket.io typed sockets)
// ============================================================================

/** Events the server listens for (client -> server). */
export interface ClientToServerEvents {
  [SOCKET_EVENTS.DRIVER_LOCATION_UPDATE]: (p: DriverLocationUpdatePayload) => void;
  [SOCKET_EVENTS.DRIVER_GO_ONLINE]: (p: DriverGoOnlinePayload) => void;
  [SOCKET_EVENTS.DRIVER_GO_OFFLINE]: (p: DriverGoOfflinePayload) => void;
  [SOCKET_EVENTS.DRIVER_TRIP_ACCEPT]: (p: DriverTripAcceptPayload) => void;
  [SOCKET_EVENTS.DRIVER_TRIP_DECLINE]: (p: DriverTripDeclinePayload) => void;
  [SOCKET_EVENTS.DRIVER_ARRIVED_AT_PICKUP]: (p: DriverArrivedAtPickupPayload) => void;
  [SOCKET_EVENTS.DRIVER_TRIP_STARTED]: (p: DriverTripStartedPayload) => void;
  [SOCKET_EVENTS.DRIVER_TRIP_COMPLETED]: (p: DriverTripCompletedPayload) => void;
}

/** Events the server emits (server -> client). */
export interface ServerToClientEvents {
  [SOCKET_EVENTS.TRIP_NEW_REQUEST]: (p: TripNewRequestPayload) => void;
  [SOCKET_EVENTS.TRIP_MATCHED]: (p: TripMatchedPayload) => void;
  [SOCKET_EVENTS.TRIP_NO_DRIVERS_AVAILABLE]: (p: TripNoDriversAvailablePayload) => void;
  [SOCKET_EVENTS.TRIP_DRIVER_LOCATION]: (p: TripDriverLocationPayload) => void;
  [SOCKET_EVENTS.TRIP_DRIVER_ARRIVED]: (p: TripDriverArrivedPayload) => void;
  [SOCKET_EVENTS.TRIP_STARTED]: (p: TripStartedPayload) => void;
  [SOCKET_EVENTS.TRIP_COMPLETED]: (p: TripCompletedPayload) => void;
  [SOCKET_EVENTS.TRIP_CANCELLED]: (p: TripCancelledPayload) => void;
  [SOCKET_EVENTS.NOTIFICATION_GENERAL]: (p: NotificationGeneralPayload) => void;
  [SOCKET_EVENTS.AUTH_ERROR]: (p: { message: string }) => void;
}

/** JWT data attached to the socket after auth middleware. */
export interface SocketAuthData {
  sub: UUID; // user/driver/admin id
  type: 'passenger' | 'driver' | 'admin';
  role?: 'super_admin' | 'admin' | 'moderator';
}

/** Room name helpers — use these, do not hand-build room strings. */
export const ROOMS = {
  driver: (id: UUID) => `driver:${id}`,
  passenger: (id: UUID) => `passenger:${id}`,
  trip: (id: UUID) => `trip:${id}`,
  adminOps: () => 'admin:ops',
} as const;
