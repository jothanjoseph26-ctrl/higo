import { create } from 'zustand';
import type { Trip, LatLng, FareEstimate, MatchedDriverDetails } from '@higo/shared-types';
import { TripStatus, VehicleType, PaymentMethod } from '@higo/shared-types';
import { getStoredTriviaPoints, setStoredTriviaPoints } from '../services/storage';

interface BookingInfo {
  pickup: (LatLng & { address: string }) | null;
  destination: (LatLng & { address: string }) | null;
  vehicleType: VehicleType;
  paymentMethod: PaymentMethod;
  isShared: boolean;
}

interface TripState extends BookingInfo {
  currentTrip: Trip | null;
  status: TripStatus | null;
  driverLocation: (LatLng & { bearing?: number }) | null;
  driverDetails: MatchedDriverDetails | null;
  estimate: FareEstimate | null;
  eta: number | null; // in minutes
  triviaPoints: number;
  pointsEarned: number;

  setPickup: (pickup: (LatLng & { address: string }) | null) => void;
  setDestination: (destination: (LatLng & { address: string }) | null) => void;
  setVehicleType: (type: VehicleType) => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  setIsShared: (shared: boolean) => void;
  setEstimate: (estimate: FareEstimate | null) => void;

  setCurrentTrip: (trip: Trip | null) => void;
  setStatus: (status: TripStatus | null) => void;
  updateDriverLocation: (loc: (LatLng & { bearing?: number }) | null) => void;
  setDriverDetails: (details: MatchedDriverDetails | null) => void;
  setEta: (eta: number | null) => void;

  hydrateTriviaPoints: () => Promise<void>;
  addTriviaPoints: (points: number) => Promise<void>;
  clearTripState: () => void;
}

export const useTripStore = create<TripState>((set, get) => ({
  // Booking Info
  pickup: null,
  destination: null,
  vehicleType: VehicleType.KEKE,
  paymentMethod: PaymentMethod.CASH,
  isShared: false,

  // Active Trip State
  currentTrip: null,
  status: null,
  driverLocation: null,
  driverDetails: null,
  estimate: null,
  eta: null,
  triviaPoints: 0,
  pointsEarned: 0,

  setPickup: (pickup) => set({ pickup }),
  setDestination: (destination) => set({ destination }),
  setVehicleType: (vehicleType) => set({ vehicleType }),
  setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
  setIsShared: (isShared) => set({ isShared }),
  setEstimate: (estimate) => set({ estimate }),

  setCurrentTrip: (currentTrip) => {
    set({
      currentTrip,
      status: currentTrip ? (currentTrip.status as TripStatus) : null,
    });
  },
  setStatus: (status) => set({ status }),
  updateDriverLocation: (driverLocation) => set({ driverLocation }),
  setDriverDetails: (driverDetails) => set({ driverDetails }),
  setEta: (eta) => set({ eta }),

  async hydrateTriviaPoints() {
    const points = await getStoredTriviaPoints();
    set({ triviaPoints: points });
  },

  async addTriviaPoints(points) {
    const currentPoints = get().triviaPoints;
    const newPoints = currentPoints + points;
    await setStoredTriviaPoints(newPoints);
    set({
      triviaPoints: newPoints,
      pointsEarned: get().pointsEarned + points,
    });
  },

  clearTripState: () =>
    set({
      pickup: null,
      destination: null,
      vehicleType: VehicleType.KEKE,
      paymentMethod: PaymentMethod.CASH,
      isShared: false,
      currentTrip: null,
      status: null,
      driverLocation: null,
      driverDetails: null,
      estimate: null,
      eta: null,
      pointsEarned: 0,
    }),
}));
