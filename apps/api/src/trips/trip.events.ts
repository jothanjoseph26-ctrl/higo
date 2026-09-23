export class TripRequested {
  constructor(
    public readonly tripId: string,
    public readonly passengerId: string,
    public readonly pickup: { lat: number; lng: number; address: string },
    public readonly destination: { lat: number; lng: number; address: string },
    public readonly vehicleType: string,
    public readonly totalFare: number,
    public readonly distanceKm: number | null,
    public readonly durationMin: number | null,
    public readonly paymentMethod: string,
    public readonly source: string = 'mobile_app',
  ) {}
}

export class DriverMatched {
  constructor(
    public readonly tripId: string,
    public readonly driverId: string,
    public readonly driverName: string,
    public readonly driverPhone: string | null,
    public readonly driverVehicle: string | null,
    public readonly driverPlate: string | null,
    public readonly etaMinutes: number | null,
  ) {}
}

export class DriverArrived {
  constructor(
    public readonly tripId: string,
    public readonly driverId: string,
  ) {}
}

export class TripStarted {
  constructor(
    public readonly tripId: string,
    public readonly driverId: string,
  ) {}
}

export class TripCompleted {
  constructor(
    public readonly tripId: string,
    public readonly driverId: string,
    public readonly passengerId: string,
    public readonly totalFare: number,
    public readonly paymentMethod: string,
  ) {}
}

export class TripCancelled {
  constructor(
    public readonly tripId: string,
    public readonly passengerId: string,
    public readonly driverId: string | null,
    public readonly cancelledBy: 'passenger' | 'driver' | 'system',
    public readonly reason: string,
  ) {}
}

export class NoDriversAvailable {
  constructor(
    public readonly tripId: string,
    public readonly passengerId: string,
  ) {}
}
