import { create } from 'zustand';
import type {
  Trip,
  LatLng,
  FareEstimate,
  MatchedDriverDetails,
  RequestTripResponse,
  GetMyTripsResponse,
  RateResponse,
  CancelTripResponse,
} from '@higo/shared-types';
import { TripStatus, VehicleType, PaymentMethod } from '@higo/shared-types';
import { api } from '../services/api';
import { getStoredTriviaPoints, setStoredTriviaPoints, setTripHistoryCache } from '../services/storage';

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
  eta: number | null;
  triviaPoints: number;
  pointsEarned: number;

  isSubmitting: boolean;
  tripError: string | null;

  tripHistory: Trip[];
  historyLoading: boolean;
  historyError: string | null;

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
  setTripError: (error: string | null) => void;
  clearTripError: () => void;

  requestTrip: () => Promise<RequestTripResponse>;
  cancelTrip: (reason: string) => Promise<CancelTripResponse>;
  rateTrip: (rating: number, comment?: string) => Promise<RateResponse>;
  fetchTripHistory: () => Promise<GetMyTripsResponse>;

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

  isSubmitting: false,
  tripError: null,

  tripHistory: [],
  historyLoading: false,
  historyError: null,

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
  setStatus: (status) => {
    const { currentTrip } = get();
    if (currentTrip && status) {
      set({
        status,
        currentTrip: { ...currentTrip, status },
      });
    } else {
      set({ status });
    }
  },
  updateDriverLocation: (driverLocation) => set({ driverLocation }),
  setDriverDetails: (driverDetails) => set({ driverDetails }),
  setEta: (eta) => set({ eta }),
  setTripError: (tripError) => set({ tripError }),
  clearTripError: () => set({ tripError: null }),

  async requestTrip() {
    const { pickup, destination, vehicleType, paymentMethod, isShared } = get();
    if (!pickup || !destination) {
      const message = 'Invalid booking details. Please try again.';
      set({ tripError: message });
      throw new Error(message);
    }

    set({ isSubmitting: true, tripError: null });
    try {
      const response = await api.requestTrip({
        pickup: { lat: pickup.lat, lng: pickup.lng },
        pickupAddress: pickup.address,
        destination: { lat: destination.lat, lng: destination.lng },
        destinationAddress: destination.address,
        vehicleType,
        paymentMethod,
        isShared,
      });

      set({
        currentTrip: response.trip,
        estimate: response.estimate,
        status: TripStatus.REQUESTED,
        isSubmitting: false,
      });

      return response;
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'Booking failed. Check pickup and destination are inside the service area.';
      set({ tripError: message, isSubmitting: false });
      throw err;
    }
  },

  async cancelTrip(reason: string) {
    const { currentTrip } = get();
    if (!currentTrip) {
      const message = 'No active trip to cancel.';
      set({ tripError: message });
      throw new Error(message);
    }

    set({ isSubmitting: true, tripError: null });
    try {
      const response = await api.cancelTrip(currentTrip.id, { reason });
      set({
        currentTrip: response.trip,
        status: TripStatus.CANCELLED,
        driverLocation: null,
        driverDetails: null,
        eta: null,
        isSubmitting: false,
      });
      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Cancellation failed';
      set({ tripError: message, isSubmitting: false });
      throw err;
    }
  },

  async rateTrip(rating: number, comment?: string) {
    const { currentTrip } = get();
    if (!currentTrip) {
      const message = 'No trip to rate.';
      set({ tripError: message });
      throw new Error(message);
    }

    set({ isSubmitting: true, tripError: null });
    try {
      const response = await api.rateDriver(currentTrip.id, { rating, comment });
      set({ isSubmitting: false });
      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Rating submission failed';
      set({ tripError: message, isSubmitting: false });
      throw err;
    }
  },

  async fetchTripHistory() {
    set({ historyLoading: true, historyError: null });
    try {
      const response = await api.getTripHistory();
      set({
        tripHistory: response.items,
        historyLoading: false,
      });
      await setTripHistoryCache(response.items);
      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load trip history';
      set({ historyError: message, historyLoading: false });
      throw err;
    }
  },

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
      tripError: null,
      isSubmitting: false,
    }),
}));