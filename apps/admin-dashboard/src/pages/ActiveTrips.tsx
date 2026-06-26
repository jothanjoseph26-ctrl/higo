import React, { useCallback, useEffect, useState } from 'react';
import { apiService } from '../services/api';
import { LiveTrip } from '@higo/shared-types';
import DataTable from '../components/DataTable';
import { ColumnDef } from '@tanstack/react-table';
import { Activity, MapPin, Navigation, RefreshCw } from 'lucide-react';

const statusStyles: Record<string, string> = {
  requested: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  matched: 'bg-blue-50 text-blue-700 border-blue-200',
  en_route: 'bg-purple-50 text-purple-700 border-purple-200',
  active: 'bg-green-50 text-success border-green-200',
};

const formatCoord = (lat: number, lng: number) => `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

export const ActiveTrips: React.FC = () => {
  const [trips, setTrips] = useState<LiveTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchTrips = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { trips: liveTrips } = await apiService.getLiveTrips();
      setTrips(liveTrips);
      setLastUpdated(new Date());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load live trips';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrips();
    const interval = setInterval(fetchTrips, 15000);
    return () => clearInterval(interval);
  }, [fetchTrips]);

  const columns: ColumnDef<LiveTrip>[] = [
    {
      accessorKey: 'tripId',
      header: 'Trip ID',
      cell: (info) => (
        <span className="font-semibold text-xs text-darkNavy font-mono">
          {info.row.original.tripId.substring(0, 10)}...
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: (info) => {
        const status = info.row.original.status;
        return (
          <span
            className={`px-2.5 py-0.5 rounded-button text-[10px] font-semibold border capitalize ${
              statusStyles[status] ?? 'bg-gray-100 text-gray-600 border-gray-200'
            }`}
          >
            {status.replace('_', ' ')}
          </span>
        );
      },
    },
    {
      accessorKey: 'passengerId',
      header: 'Passenger',
      cell: (info) => (
        <span className="text-xs text-gray-600 font-mono">
          {info.row.original.passengerId.substring(0, 8)}...
        </span>
      ),
    },
    {
      accessorKey: 'driverId',
      header: 'Driver',
      cell: (info) => (
        <span className="text-xs text-gray-600 font-mono">
          {info.row.original.driverId ? `${info.row.original.driverId.substring(0, 8)}...` : 'Unassigned'}
        </span>
      ),
    },
    {
      accessorKey: 'pickup',
      header: 'Pickup',
      cell: (info) => (
        <div className="flex items-center gap-1 text-[10px] text-gray-500">
          <MapPin size={10} className="text-primaryGreen" />
          {formatCoord(info.row.original.pickup.lat, info.row.original.pickup.lng)}
        </div>
      ),
    },
    {
      accessorKey: 'destination',
      header: 'Destination',
      cell: (info) => (
        <div className="flex items-center gap-1 text-[10px] text-gray-500">
          <Navigation size={10} className="text-accentOrange" />
          {formatCoord(info.row.original.destination.lat, info.row.original.destination.lng)}
        </div>
      ),
    },
    {
      accessorKey: 'startedAt',
      header: 'Started',
      cell: (info) => (
        <span className="text-xs text-gray-500">
          {info.row.original.startedAt
            ? new Date(info.row.original.startedAt).toLocaleTimeString()
            : '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-darkNavy flex items-center gap-2">
            <Activity size={24} className="text-primaryGreen" />
            Active Trips
          </h1>
          <p className="text-xs text-gray-500">
            Live monitoring table — auto-refreshes every 15 seconds
            {lastUpdated && (
              <span className="ml-1 text-gray-400">
                (last update {lastUpdated.toLocaleTimeString()})
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold bg-primaryGreen text-white px-3 py-1 rounded-button">
            {trips.length} live
          </span>
          <button
            onClick={fetchTrips}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-lightGrey rounded-button text-xs font-semibold hover:bg-lightGrey transition-all"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-card text-error text-xs">
          {error}
        </div>
      )}

      <DataTable columns={columns} data={trips} loading={loading} />
    </div>
  );
};

export default ActiveTrips;