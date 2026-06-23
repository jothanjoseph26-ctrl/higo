import React, { useEffect, useRef, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import { usePermissions } from '../hooks/usePermissions';
import { apiService } from '../services/api';
import { ZoneResponse, ZoneType, LatLng } from '@higo/shared-types';
import { MapPin, Trash2, Plus, AlertCircle, Save } from 'lucide-react';

interface ZoneEditorProps {
  onZoneCreated?: () => void;
}

export const ZoneEditor: React.FC<ZoneEditorProps> = ({ onZoneCreated }) => {
  const { canEditZones, canDeleteZone } = usePermissions();
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [loader, setLoader] = useState<Loader | null>(null);
  const [zones, setZones] = useState<ZoneResponse[]>([]);
  const [selectedZone, setSelectedZone] = useState<ZoneResponse | null>(null);

  // Form State for creating a zone
  const [zoneName, setZoneName] = useState('');
  const [zoneType, setZoneType] = useState<ZoneType>(ZoneType.PERMITTED);
  const [surgeMultiplier, setSurgeMultiplier] = useState('1.0');
  const [newBoundary, setNewBoundary] = useState<LatLng[]>([]);
  const [drawingMode, setDrawingMode] = useState(false);
  const [loading, setLoading] = useState(false);

  const drawnPolygonRef = useRef<google.maps.Polygon | null>(null);
  const mapPolygonsRef = useRef<Record<string, google.maps.Polygon>>({});
  const drawingManagerRef = useRef<any>(null);

  // Fetch zones on load
  const loadZones = async () => {
    try {
      const data = await apiService.getZones();
      setZones(data);
    } catch (err) {
      console.error('Failed to load zones:', err);
    }
  };

  useEffect(() => {
    loadZones();
  }, []);

  // Initialize Map
  useEffect(() => {
    if (!mapRef.current) return;

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
    const googleLoader = new Loader({
      apiKey,
      version: 'weekly',
      libraries: ['drawing'],
    });

    setLoader(googleLoader);

    googleLoader.load().then((google) => {
      const mapInstance = new google.maps.Map(mapRef.current!, {
        center: { lat: 9.0765, lng: 7.3986 }, // Abuja center
        zoom: 12,
        styles: [
          {
            featureType: 'administrative',
            elementType: 'geometry',
            stylers: [{ visibility: 'on' }],
          },
        ],
      });
      setMap(mapInstance);
    }).catch((err) => {
      console.error('Failed to load Google Maps SDK:', err);
    });
  }, [mapRef]);

  // Render Polygons on map
  useEffect(() => {
    if (!map || !loader) return;

    // Clear old polygons
    Object.values(mapPolygonsRef.current).forEach((p) => p.setMap(null));
    mapPolygonsRef.current = {};

    zones.forEach((zone) => {
      const color =
        zone.zoneType === ZoneType.RESTRICTED
          ? '#DC2626'
          : zone.zoneType === ZoneType.SURGE
          ? '#FF7A00'
          : '#0B6E4F';

      const polygon = new google.maps.Polygon({
        paths: zone.boundary,
        strokeColor: color,
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: color,
        fillOpacity: 0.25,
        map: map,
      });

      polygon.addListener('click', () => {
        setSelectedZone(zone);
      });

      mapPolygonsRef.current[zone.id] = polygon;
    });
  }, [map, loader, zones]);

  // Setup Drawing Manager
  const startDrawing = () => {
    if (!map || !canEditZones) return;

    setDrawingMode(true);
    setNewBoundary([]);
    if (drawnPolygonRef.current) {
      drawnPolygonRef.current.setMap(null);
      drawnPolygonRef.current = null;
    }

    const dm = new google.maps.drawing.DrawingManager({
      drawingMode: google.maps.drawing.OverlayType.POLYGON,
      drawingControl: true,
      drawingControlOptions: {
        position: google.maps.ControlPosition.TOP_CENTER,
        drawingModes: [google.maps.drawing.OverlayType.POLYGON],
      },
      polygonOptions: {
        fillColor: '#FF7A00',
        fillOpacity: 0.3,
        strokeWeight: 2,
        clickable: true,
        editable: true,
        zIndex: 1,
      },
    });

    dm.setMap(map);
    drawingManagerRef.current = dm;

    google.maps.event.addListener(dm, 'polygoncomplete', (polygon: google.maps.Polygon) => {
      drawnPolygonRef.current = polygon;
      const paths = polygon.getPath();
      const coords: LatLng[] = [];
      for (let i = 0; i < paths.getLength(); i++) {
        const point = paths.getAt(i);
        coords.push({ lat: point.lat(), lng: point.lng() });
      }
      setNewBoundary(coords);
      dm.setDrawingMode(null); // Stop drawing mode
    });
  };

  const cancelDrawing = () => {
    setDrawingMode(false);
    setNewBoundary([]);
    if (drawnPolygonRef.current) {
      drawnPolygonRef.current.setMap(null);
      drawnPolygonRef.current = null;
    }
    if (drawingManagerRef.current) {
      drawingManagerRef.current.setMap(null);
      drawingManagerRef.current = null;
    }
  };

  const handleSaveZone = async () => {
    if (!zoneName.trim() || newBoundary.length < 3) {
      alert('Please enter a zone name and draw a boundary polygon with at least 3 points.');
      return;
    }

    try {
      setLoading(true);
      const payload = {
        name: zoneName,
        zoneType,
        boundary: newBoundary,
        surgeMultiplier: zoneType === ZoneType.SURGE ? parseFloat(surgeMultiplier) : 1.0,
      };

      await apiService.createZone(payload);
      alert('Zone saved successfully!');
      cancelDrawing();
      setZoneName('');
      loadZones();
      if (onZoneCreated) onZoneCreated();
    } catch (err: any) {
      alert(err.message || 'Failed to save zone geofence.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteZone = async (zoneId: string) => {
    if (!canDeleteZone) {
      alert('Delete zone is restricted to super_admin only.');
      return;
    }

    if (!window.confirm('Are you sure you want to delete this zone geofence?')) {
      return;
    }

    try {
      setLoading(true);
      await apiService.deleteZone(zoneId);
      setSelectedZone(null);
      loadZones();
      if (onZoneCreated) onZoneCreated();
    } catch (err: any) {
      alert(err.message || 'Failed to delete zone.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 w-full h-[650px]">
      {/* Map canvas */}
      <div className="flex-1 bg-white rounded-card shadow-custom relative overflow-hidden h-full">
        <div ref={mapRef} className="w-full h-full min-h-[400px]" />
        {!drawingMode && canEditZones && (
          <button
            onClick={startDrawing}
            className="absolute top-4 left-4 bg-primaryGreen text-white px-4 py-2 rounded-button text-sm font-semibold flex items-center gap-2 shadow-custom hover:bg-opacity-95 z-10"
          >
            <Plus size={16} />
            <span>Draw New Zone</span>
          </button>
        )}
        {drawingMode && (
          <div className="absolute top-4 left-4 bg-white p-3 rounded-card shadow-custom z-10 flex gap-2 border border-lightGrey">
            <button
              onClick={handleSaveZone}
              disabled={newBoundary.length === 0 || loading}
              className="bg-primaryGreen text-white px-3 py-1.5 rounded-button text-xs font-semibold hover:bg-opacity-90 transition-all flex items-center gap-1"
            >
              <Save size={14} />
              <span>Save Zone</span>
            </button>
            <button
              onClick={cancelDrawing}
              className="bg-gray-200 text-darkNavy px-3 py-1.5 rounded-button text-xs font-semibold hover:bg-lightGrey transition-all"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Editor & details pane */}
      <div className="w-full lg:w-80 bg-white p-6 rounded-card shadow-custom flex flex-col justify-between h-full overflow-y-auto">
        <div>
          {drawingMode ? (
            <div className="space-y-4">
              <h3 className="font-semibold text-base text-darkNavy">Create Geofence Zone</h3>
              <p className="text-xs text-gray-500">
                Click on the map to define the corners of the polygon. Close the path by clicking the first dot.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-darkNavy mb-1">Zone Name</label>
                  <input
                    type="text"
                    value={zoneName}
                    onChange={(e) => setZoneName(e.target.value)}
                    placeholder="e.g. Wuse Launch Zone"
                    className="w-full px-3 py-2 border border-lightGrey rounded-input text-xs focus:outline-none focus:border-primaryGreen"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-darkNavy mb-1">Zone Type</label>
                  <select
                    value={zoneType}
                    onChange={(e) => setZoneType(e.target.value as ZoneType)}
                    className="w-full px-3 py-2 border border-lightGrey rounded-input text-xs focus:outline-none"
                  >
                    <option value={ZoneType.PERMITTED}>Permitted (Green)</option>
                    <option value={ZoneType.RESTRICTED}>Restricted (Red)</option>
                    <option value={ZoneType.SURGE}>Surge Multiplier (Orange)</option>
                  </select>
                </div>

                {zoneType === ZoneType.SURGE && (
                  <div>
                    <label className="block text-xs font-semibold text-darkNavy mb-1">Surge Multiplier</label>
                    <input
                      type="number"
                      step="0.1"
                      value={surgeMultiplier}
                      onChange={(e) => setSurgeMultiplier(e.target.value)}
                      placeholder="e.g. 1.5"
                      className="w-full px-3 py-2 border border-lightGrey rounded-input text-xs focus:outline-none"
                    />
                  </div>
                )}
              </div>
            </div>
          ) : selectedZone ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-lightGrey pb-2">
                <h3 className="font-semibold text-base text-darkNavy">{selectedZone.name}</h3>
                <button
                  onClick={() => setSelectedZone(null)}
                  className="text-xs text-gray-400 hover:text-darkNavy"
                >
                  Clear Selection
                </button>
              </div>

              <div className="space-y-2 text-xs">
                <p>
                  <strong>Type:</strong>{' '}
                  <span
                    className={`capitalize font-semibold ${
                      selectedZone.zoneType === ZoneType.RESTRICTED
                        ? 'text-error'
                        : selectedZone.zoneType === ZoneType.SURGE
                        ? 'text-accentOrange'
                        : 'text-primaryGreen'
                    }`}
                  >
                    {selectedZone.zoneType}
                  </span>
                </p>
                <p>
                  <strong>Active Status:</strong> {selectedZone.isActive ? 'Active' : 'Inactive'}
                </p>
                <p>
                  <strong>Surge Rate:</strong> {selectedZone.surgeMultiplier}x
                </p>
                <p>
                  <strong>Boundary Points:</strong> {selectedZone.boundary.length}
                </p>
              </div>

              {canDeleteZone && (
                <button
                  onClick={() => handleDeleteZone(selectedZone.id)}
                  disabled={loading}
                  className="w-full mt-4 flex items-center justify-center gap-2 bg-red-50 text-error border border-error border-opacity-20 hover:bg-red-100 py-2 rounded-button text-xs font-semibold transition-all"
                >
                  <Trash2 size={14} />
                  <span>Delete Zone</span>
                </button>
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400">
              <MapPin size={48} className="mx-auto mb-2 opacity-50 text-primaryGreen" />
              <p className="text-xs">Select a zone polygon on the map to review details, or click "Draw New Zone" to define a geofence.</p>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="border-t border-lightGrey pt-4 mt-4">
          <h4 className="text-xs font-semibold text-darkNavy mb-2">Zone Type Legend</h4>
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-primaryGreen" />
              <span>Permitted / Launch Zone (Green)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-error" />
              <span>Restricted Zone (Red)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-accentOrange" />
              <span>Dynamic Surge Zone (Orange)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ZoneEditor;
