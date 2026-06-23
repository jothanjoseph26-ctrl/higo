import React, { useEffect, useRef, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import { useLiveMap } from '../hooks/useLiveMap';
import { useOpsMapStore } from '../stores/opsMapStore';
import { MapPin, Navigation, Info, Loader2 } from 'lucide-react';

export const OperationsMap: React.FC = () => {
  const { drivers, trips, loading: seedLoading, error } = useLiveMap();
  const { selectedDriverId, selectDriver, selectTrip } = useOpsMapStore();

  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [loader, setLoader] = useState<Loader | null>(null);

  const markersRef = useRef<Record<string, google.maps.Marker>>({});
  const tripMarkersRef = useRef<Record<string, { pickup: google.maps.Marker; dest: google.maps.Marker }>>({});

  // Initialize Map
  useEffect(() => {
    if (!mapRef.current) return;

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
    const googleLoader = new Loader({
      apiKey,
      version: 'weekly',
    });

    setLoader(googleLoader);

    googleLoader.load().then((google) => {
      const mapInstance = new google.maps.Map(mapRef.current!, {
        center: { lat: 9.0765, lng: 7.3986 }, // Abuja center coordinates
        zoom: 13,
        styles: [
          {
            featureType: 'poi',
            elementType: 'labels',
            stylers: [{ visibility: 'off' }],
          },
        ],
      });
      setMap(mapInstance);
    }).catch((err) => {
      console.error('Failed to load Google Maps SDK:', err);
    });

    return () => {
      // Cleanup markers on map unload
      Object.values(markersRef.current).forEach((m) => m.setMap(null));
      markersRef.current = {};
      Object.values(tripMarkersRef.current).forEach((t) => {
        t.pickup.setMap(null);
        t.dest.setMap(null);
      });
      tripMarkersRef.current = {};
    };
  }, []);

  // Update Driver Markers in Map
  useEffect(() => {
    if (!map || !loader || !window.google) return;

    const google = window.google;
    const currentDriverIds = new Set(drivers.map((d) => d.driverId));

    // Remove obsolete driver markers
    Object.keys(markersRef.current).forEach((driverId) => {
      if (!currentDriverIds.has(driverId)) {
        markersRef.current[driverId].setMap(null);
        delete markersRef.current[driverId];
      }
    });

    // Upsert live driver markers
    drivers.forEach((driver) => {
      const { driverId, location, bearing, name, vehiclePlate } = driver;
      const pos = new google.maps.LatLng(location.lat, location.lng);

      const symbolIcon: google.maps.Symbol = {
        path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
        scale: 5,
        fillColor: '#0B6E4F',
        fillOpacity: 1,
        strokeColor: '#FFFFFF',
        strokeWeight: 1.5,
        rotation: bearing || 0,
      };

      if (markersRef.current[driverId]) {
        const marker = markersRef.current[driverId];
        marker.setPosition(pos);
        marker.setIcon(symbolIcon);
      } else {
        const marker = new google.maps.Marker({
          position: pos,
          map: map,
          icon: symbolIcon,
          title: name || `Driver ${driverId}`,
        });

        marker.addListener('click', () => {
          selectDriver(driverId);
        });

        markersRef.current[driverId] = marker;
      }
    });
  }, [map, loader, drivers, selectDriver]);

  // Render active trip points
  useEffect(() => {
    if (!map || !loader || !window.google) return;

    const google = window.google;
    const activeTripIds = new Set(trips.map((t) => t.tripId));

    // Remove finished/cancelled trips markers
    Object.keys(tripMarkersRef.current).forEach((tripId) => {
      if (!activeTripIds.has(tripId)) {
        tripMarkersRef.current[tripId].pickup.setMap(null);
        tripMarkersRef.current[tripId].dest.setMap(null);
        delete tripMarkersRef.current[tripId];
      }
    });

    // Render pickup & destination pins
    trips.forEach((trip) => {
      const { tripId, pickup, destination, status } = trip;
      if (tripMarkersRef.current[tripId]) return; // Already rendered

      const pickupMarker = new google.maps.Marker({
        position: new google.maps.LatLng(pickup.lat, pickup.lng),
        map: map,
        icon: {
          url: 'https://maps.google.com/mapfiles/ms/icons/green-dot.png',
          scaledSize: new google.maps.Size(32, 32),
        },
        title: `Trip ${tripId} Pickup`,
      });

      const destMarker = new google.maps.Marker({
        position: new google.maps.LatLng(destination.lat, destination.lng),
        map: map,
        icon: {
          url: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
          scaledSize: new google.maps.Size(32, 32),
        },
        title: `Trip ${tripId} Destination`,
      });

      pickupMarker.addListener('click', () => {
        selectTrip(tripId);
      });
      destMarker.addListener('click', () => {
        selectTrip(tripId);
      });

      tripMarkersRef.current[tripId] = {
        pickup: pickupMarker,
        dest: destMarker,
      };
    });
  }, [map, loader, trips, selectTrip]);

  const activeDriver = drivers.find((d) => d.driverId === selectedDriverId);

  return (
    <div className="space-y-4 h-[calc(100vh-120px)] flex flex-col">
      <div className="flex justify-between items-center flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-darkNavy">Operations Live Map</h1>
          <p className="text-xs text-gray-500">Real-time driver location tracking control dashboard</p>
        </div>
        <div className="flex items-center gap-4 text-xs font-semibold text-darkNavy">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-primaryGreen" />
            <span>Drivers online: {drivers.length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-accentOrange animate-pulse" />
            <span>Active trips: {trips.length}</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border-l-4 border-error text-error text-xs rounded-r-md flex items-center gap-2 flex-shrink-0">
          <Info size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row gap-4 overflow-hidden relative">
        {/* Map Canvas */}
        <div className="flex-1 bg-white rounded-card shadow-custom overflow-hidden h-full relative border border-lightGrey">
          {seedLoading && (
            <div className="absolute inset-0 bg-white bg-opacity-70 flex items-center justify-center z-10">
              <Loader2 className="animate-spin text-primaryGreen" size={40} />
            </div>
          )}
          <div ref={mapRef} className="w-full h-full min-h-[400px]" />
        </div>

        {/* Floating operations panel */}
        <div className="w-full lg:w-80 bg-white p-5 rounded-card shadow-custom border border-lightGrey h-full overflow-y-auto flex flex-col justify-between flex-shrink-0">
          <div>
            <h3 className="font-semibold text-sm text-darkNavy border-b border-lightGrey pb-2 mb-4 flex items-center gap-2">
              <Navigation className="text-primaryGreen" size={16} />
              <span>Operations Dispatch Desk</span>
            </h3>

            {activeDriver ? (
              <div className="space-y-4 text-xs">
                <div>
                  <h4 className="font-bold text-darkNavy mb-2">Driver Tracking Details</h4>
                  <div className="space-y-2 bg-lightGrey p-3 rounded-input text-dark font-medium">
                    <p><strong>Name:</strong> {activeDriver.name || 'N/A'}</p>
                    <p><strong>Phone:</strong> {activeDriver.phone || 'N/A'}</p>
                    <p><strong>Plate Number:</strong> {activeDriver.vehiclePlate || 'N/A'}</p>
                    <p><strong>ID:</strong> {activeDriver.driverId}</p>
                    <p><strong>Speed:</strong> {activeDriver.speed ? `${Math.round(activeDriver.speed)} km/h` : '0 km/h'}</p>
                  </div>
                </div>

                <button
                  onClick={() => selectDriver(null)}
                  className="w-full py-2 bg-lightGrey hover:bg-gray-200 text-darkNavy font-semibold rounded-button border border-lightGrey text-center"
                >
                  Clear Selected Tracking
                </button>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-400">
                <MapPin size={48} className="mx-auto mb-2 opacity-30 text-primaryGreen" />
                <p className="text-xs">Click a vehicle arrow icon on the live map to trace active driver routes and vehicle telemetry.</p>
              </div>
            )}
          </div>

          <div className="border-t border-lightGrey pt-4 mt-4">
            <h4 className="text-xs font-bold text-darkNavy mb-2">Map Legend</h4>
            <div className="space-y-2 text-[10px] text-gray-500 font-semibold uppercase">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-primaryGreen rounded-full flex items-center justify-center text-white">▲</div>
                <span>Active Driver (Directional Arrow)</span>
              </div>
              <div className="flex items-center gap-2">
                <img src="https://maps.google.com/mapfiles/ms/icons/green-dot.png" alt="pickup" className="w-4 h-4" />
                <span>Trip Pickup Location</span>
              </div>
              <div className="flex items-center gap-2">
                <img src="https://maps.google.com/mapfiles/ms/icons/red-dot.png" alt="destination" className="w-4 h-4" />
                <span>Trip Destination Target</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OperationsMap;
