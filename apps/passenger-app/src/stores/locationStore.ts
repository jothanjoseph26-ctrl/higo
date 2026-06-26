import { create } from 'zustand';
import type { LatLng } from '@higo/shared-types';

interface LocationState {
  userLocation: LatLng | null;
  permissionStatus: 'granted' | 'denied' | 'undetermined';
  requestPermission: () => Promise<boolean>;
  watch: (callback?: (loc: LatLng) => void) => () => void;
  updateLocation: (loc: LatLng) => void;
}

export const useLocationStore = create<LocationState>((set, get) => {
  let watchInterval: any = null;

  return {
    userLocation: { lat: 9.07, lng: 7.465 }, // Wuse II — inside launch service area
    permissionStatus: 'granted',

    async requestPermission() {
      set({ permissionStatus: 'granted' });
      return true;
    },

    watch(callback) {
      if (watchInterval) {
        clearInterval(watchInterval);
      }

      // In a real device/Expo environment, you'd use expo-location / react-native-geolocation.
      // Here we simulate subtle passenger location movements or return Abuja baseline coordinates.
      const update = () => {
        const current = get().userLocation || { lat: 9.07, lng: 7.465 };
        // Add tiny random jitter to simulate live presence
        const newLoc = {
          lat: current.lat + (Math.random() - 0.5) * 0.0001,
          lng: current.lng + (Math.random() - 0.5) * 0.0001,
        };
        set({ userLocation: newLoc });
        if (callback) {
          callback(newLoc);
        }
      };

      // Initial update
      update();
      watchInterval = setInterval(update, 10000); // watch every 10 seconds

      return () => {
        if (watchInterval) {
          clearInterval(watchInterval);
          watchInterval = null;
        }
      };
    },

    updateLocation(loc: LatLng) {
      set({ userLocation: loc });
    },
  };
});
