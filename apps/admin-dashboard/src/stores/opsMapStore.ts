import { create } from 'zustand';
import { LiveTrip, LatLng } from '@higo/shared-types';

export interface DriverMarkerData {
  driverId: string;
  location: LatLng;
  bearing?: number;
  speed?: number;
  name?: string;
  phone?: string;
  vehiclePlate?: string;
  isOnline: boolean;
}

interface OpsMapState {
  drivers: Record<string, DriverMarkerData>;
  trips: LiveTrip[];
  selectedDriverId: string | null;
  selectedTripId: string | null;
  setDrivers: (drivers: Record<string, DriverMarkerData>) => void;
  upsertDriver: (driverId: string, data: Partial<DriverMarkerData>) => void;
  removeDriver: (driverId: string) => void;
  setTrips: (trips: LiveTrip[]) => void;
  upsertTrip: (trip: LiveTrip) => void;
  removeTrip: (tripId: string) => void;
  selectDriver: (driverId: string | null) => void;
  selectTrip: (tripId: string | null) => void;
}

export const useOpsMapStore = create<OpsMapState>((set) => ({
  drivers: {},
  trips: [],
  selectedDriverId: null,
  selectedTripId: null,
  setDrivers: (drivers) => set({ drivers }),
  upsertDriver: (driverId, data) =>
    set((state) => {
      const existing = state.drivers[driverId];
      if (!existing && !data.location) return state;
      const updated = {
        driverId,
        location: data.location || existing.location,
        bearing: data.bearing !== undefined ? data.bearing : existing?.bearing,
        speed: data.speed !== undefined ? data.speed : existing?.speed,
        name: data.name !== undefined ? data.name : existing?.name,
        phone: data.phone !== undefined ? data.phone : existing?.phone,
        vehiclePlate: data.vehiclePlate !== undefined ? data.vehiclePlate : existing?.vehiclePlate,
        isOnline: data.isOnline !== undefined ? data.isOnline : (existing?.isOnline ?? true),
      };
      return {
        drivers: {
          ...state.drivers,
          [driverId]: updated,
        },
      };
    }),
  removeDriver: (driverId) =>
    set((state) => {
      const copy = { ...state.drivers };
      delete copy[driverId];
      return { drivers: copy };
    }),
  setTrips: (trips) => set({ trips }),
  upsertTrip: (trip) =>
    set((state) => {
      const index = state.trips.findIndex((t) => t.tripId === trip.tripId);
      const updatedTrips = [...state.trips];
      if (index > -1) {
        updatedTrips[index] = { ...updatedTrips[index], ...trip };
      } else {
        updatedTrips.push(trip);
      }
      return { trips: updatedTrips };
    }),
  removeTrip: (tripId) =>
    set((state) => ({
      trips: state.trips.filter((t) => t.tripId !== tripId),
    })),
  selectDriver: (driverId) => set({ selectedDriverId: driverId }),
  selectTrip: (tripId) => set({ selectedTripId: tripId }),
}));
