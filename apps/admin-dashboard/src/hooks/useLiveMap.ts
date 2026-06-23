import { useEffect, useState } from 'react';
import { useOpsMapStore } from '../stores/opsMapStore';
import { initSocket, disconnectSocket } from '../services/socket';
import { apiService } from '../services/api';

export const useLiveMap = () => {
  const { drivers, trips, setTrips, setDrivers } = useOpsMapStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const seedState = async () => {
      try {
        setLoading(true);
        const { trips: liveTrips } = await apiService.getLiveTrips();
        if (active) {
          setTrips(liveTrips);

          const initialDrivers: any = {};
          liveTrips.forEach((trip) => {
            if (trip.driverId && trip.driverLocation) {
              initialDrivers[trip.driverId] = {
                driverId: trip.driverId,
                location: trip.driverLocation,
                isOnline: true,
              };
            }
          });
          setDrivers(initialDrivers);
          setError(null);
        }
      } catch (err: any) {
        console.error('Failed to seed live map state:', err);
        if (active) {
          setError(err.message || 'Failed to fetch live operations state');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    seedState();

    const socket = initSocket();

    const handleReconnect = () => {
      console.log('Socket reconnected, reseeding live map state');
      seedState();
    };

    socket.on('reconnect', handleReconnect);

    return () => {
      active = false;
      socket.off('reconnect', handleReconnect);
      disconnectSocket();
    };
  }, [setTrips, setDrivers]);

  return { drivers: Object.values(drivers), trips, loading, error };
};
