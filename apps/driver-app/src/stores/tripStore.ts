import { create } from 'zustand';
import { Audio } from 'expo-av';
import { Trip, TripStatus, TripNewRequestPayload } from '@higo/shared-types';
import { api } from '../services/api';
import { getSocket } from '../services/socket';
import { startBackgroundLocation } from '../services/location-task';
import { enqueueJob } from '../services/jobQueue';

interface TripState {
  activeTrip: Trip | null;
  incomingRequest: TripNewRequestPayload | null;
  countdown: number;
  isSOSActive: boolean;

  setIncomingRequest: (req: TripNewRequestPayload | null) => Promise<void>;
  decrementCountdown: () => void;
  acceptTrip: (tripId: string) => Promise<void>;
  declineTrip: (tripId: string, reason: string) => Promise<void>;
  arriveAtPickup: (tripId: string) => Promise<void>;
  startTrip: (tripId: string) => Promise<void>;
  completeTrip: (tripId: string) => Promise<void>;
  ratePassenger: (tripId: string, rating: number, comment?: string) => Promise<void>;
  triggerSOS: (tripId: string) => Promise<void>;
  setActiveTrip: (trip: Trip | null) => void;
}

let countdownInterval: NodeJS.Timeout | null = null;
let soundInstance: Audio.Sound | null = null;

export const useTripStore = create<TripState>((set, get) => ({
  activeTrip: null,
  incomingRequest: null,
  countdown: 15,
  isSOSActive: false,

  async setIncomingRequest(req) {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }

    if (soundInstance) {
      try {
        await soundInstance.stopAsync();
        await soundInstance.unloadAsync();
      } catch {}
      soundInstance = null;
    }

    if (!req) {
      set({ incomingRequest: null, countdown: 15 });
      return;
    }

    set({ incomingRequest: req, countdown: 15 });

    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-84.wav' },
        { shouldPlay: true, isLooping: true }
      );
      soundInstance = sound;
    } catch (err) {
      console.warn('Failed to play incoming request sound:', err);
    }

    countdownInterval = setInterval(() => {
      get().decrementCountdown();
    }, 1000);
  },

  decrementCountdown() {
    const { countdown, incomingRequest, declineTrip } = get();
    if (countdown <= 1) {
      if (incomingRequest) {
        void declineTrip(incomingRequest.tripId, 'timeout');
      }
    } else {
      set({ countdown: countdown - 1 });
    }
  },

  async acceptTrip(tripId) {
    const socket = getSocket();
    if (socket?.connected) {
      socket.emit('driver:trip_accept', { tripId });
    } else {
      await enqueueJob('trip_accept', { tripId });
    }

    const req = get().incomingRequest;
    const tempTrip: Partial<Trip> = {
      id: tripId,
      status: TripStatus.MATCHED,
      pickupAddress: req?.pickupAddress || 'Pickup Address',
      pickupLocation: req?.pickup || { lat: 9.0765, lng: 7.3986 },
      destinationAddress: req?.destinationAddress || 'Destination Address',
      destinationLocation: req?.destination || { lat: 9.0765, lng: 7.3986 },
      totalFare: req?.fare || 0,
      startedAt: null,
      completedAt: null,
    };
    set({ activeTrip: tempTrip as Trip });

    await get().setIncomingRequest(null);

    try {
      await startBackgroundLocation(true);
    } catch (err) {
      console.error(err);
    }
  },

  async declineTrip(tripId, reason) {
    const socket = getSocket();
    if (socket?.connected) {
      socket.emit('driver:trip_decline', { tripId, reason });
    } else {
      await enqueueJob('trip_decline', { tripId, reason });
    }
    await get().setIncomingRequest(null);
  },

  async arriveAtPickup(tripId) {
    const socket = getSocket();
    if (socket?.connected) {
      socket.emit('driver:arrived_at_pickup', { tripId });
    } else {
      await enqueueJob('arrived', { tripId });
    }

    const current = get().activeTrip;
    if (current) {
      set({ activeTrip: { ...current, status: TripStatus.EN_ROUTE } });
    }
  },

  async startTrip(tripId) {
    const socket = getSocket();
    if (socket?.connected) {
      socket.emit('driver:trip_started', { tripId });
    } else {
      await enqueueJob('trip_started', { tripId });
    }

    const current = get().activeTrip;
    if (current) {
      set({ activeTrip: { ...current, status: TripStatus.ACTIVE, startedAt: new Date().toISOString() } });
    }
  },

  async completeTrip(tripId) {
    const socket = getSocket();
    if (socket?.connected) {
      socket.emit('driver:trip_completed', { tripId });
    } else {
      await enqueueJob('trip_completed', { tripId });
    }

    const current = get().activeTrip;
    if (current) {
      set({
        activeTrip: {
          ...current,
          status: TripStatus.COMPLETED,
          completedAt: new Date().toISOString(),
        },
      });
    }

    try {
      await startBackgroundLocation(false);
    } catch (err) {
      console.error(err);
    }
  },

  async ratePassenger(tripId, rating, comment) {
    try {
      await api.request({
        method: 'POST',
        url: `/trips/${tripId}/rate-passenger`,
        data: { rating, comment },
      });
    } catch (err) {
      console.error('Failed to rate passenger, queueing...', err);
      await enqueueJob('rating', { tripId, rating, comment });
    }
  },

  async triggerSOS(tripId) {
    set({ isSOSActive: true });
    try {
      await api.request({
        method: 'POST',
        url: `/trips/${tripId}/sos`,
        data: { lat: 9.0765, lng: 7.3986 },
      });
    } catch (err) {
      console.error('Failed to trigger SOS REST', err);
    }

    const sosInterval = setInterval(async () => {
      const active = get().isSOSActive;
      if (!active) {
        clearInterval(sosInterval);
        return;
      }
      try {
        await api.request({
          method: 'POST',
          url: `/drivers/location`,
          data: { lat: 9.0765, lng: 7.3986, bearing: 0, speed: 0 },
        });
      } catch {}
    }, 30_000);
  },

  setActiveTrip(trip) {
    set({ activeTrip: trip });
  },
}));
