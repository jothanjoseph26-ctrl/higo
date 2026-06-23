import React, { useState } from 'react';
import ZoneEditor from '../components/ZoneEditor';
import { ShieldCheck, HelpCircle } from 'lucide-react';

export const ZonesGeofencing: React.FC = () => {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleZoneCreated = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-darkNavy">Zones & Geofencing Manager</h1>
        <p className="text-xs text-gray-500">Define launch areas, restricted travel coordinates, and configure surge regions</p>
      </div>

      <div className="bg-white p-6 rounded-card shadow-custom border border-lightGrey">
        <ZoneEditor key={refreshKey} onZoneCreated={handleZoneCreated} />
      </div>

      {/* Corporate Geofence Legality Rules */}
      <div className="bg-white p-6 rounded-card shadow-custom border border-lightGrey">
        <h3 className="font-semibold text-sm text-darkNavy border-b border-lightGrey pb-2 mb-4 flex items-center gap-1.5">
          <ShieldCheck className="text-primaryGreen" size={18} />
          <span>FCT Abuja Legally Mandated Geofences</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs leading-relaxed text-dark font-medium">
          <div className="p-4 bg-green-50 bg-opacity-30 border border-green-200 rounded-input">
            <h4 className="font-bold text-primaryGreen mb-2">Permitted / Launch Zones</h4>
            <p className="mb-2">
              Keke transport operations are authorized to pick up and drop off passengers within these zones:
            </p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Apo & Lokogoma Axis</li>
              <li>Lugbe Corridor</li>
              <li>Gudu & Kaura Districts</li>
              <li>Games Village & Wuye</li>
              <li>Utako, Wuse, and Gwarimpa</li>
            </ul>
          </div>

          <div className="p-4 bg-red-50 bg-opacity-30 border border-red-200 rounded-input">
            <h4 className="font-bold text-error mb-2">Restricted Zones (Violations Audited)</h4>
            <p className="mb-2">
              Keke entry is strictly prohibited due to ministerial regulations. Auto-cancellations dispatch if pickups are placed here:
            </p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Maitama & Asokoro Residential Districts</li>
              <li>Central Business District (CBD)</li>
              <li>Three Arms Zone & Aso Villa Axis</li>
              <li>Diplomatic Zone Area</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ZonesGeofencing;
