import { Injectable } from '@nestjs/common';
import { Socket } from 'socket.io';
import { ROOMS } from '@higo/shared-types';

@Injectable()
export class RoomService {
  joinDriver(socket: Socket, driverId: string): void {
    socket.join(ROOMS.driver(driverId));
  }

  leaveDriver(socket: Socket, driverId: string): void {
    socket.leave(ROOMS.driver(driverId));
  }

  joinPassenger(socket: Socket, passengerId: string): void {
    socket.join(ROOMS.passenger(passengerId));
  }

  leavePassenger(socket: Socket, passengerId: string): void {
    socket.leave(ROOMS.passenger(passengerId));
  }

  joinTrip(socket: Socket, tripId: string): void {
    socket.join(ROOMS.trip(tripId));
  }

  leaveTrip(socket: Socket, tripId: string): void {
    socket.leave(ROOMS.trip(tripId));
  }

  joinAdmin(socket: Socket): void {
    socket.join(ROOMS.adminOps());
  }

  leaveAdmin(socket: Socket): void {
    socket.leave(ROOMS.adminOps());
  }
}
