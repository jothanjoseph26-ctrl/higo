import React, { useState } from 'react';
import { usePermissions } from '../hooks/usePermissions';
import { apiService } from '../services/api';
import { VehicleType } from '@higo/shared-types';
import { AlertCircle, CheckCircle2, Sliders } from 'lucide-react';

interface PricingFormProps {
  onSuccess?: () => void;
}

export const PricingForm: React.FC<PricingFormProps> = ({ onSuccess }) => {
  const { canEditPricing } = usePermissions();
  const [vehicleType, setVehicleType] = useState<VehicleType>(VehicleType.KEKE);
  const [baseFareNGN, setBaseFareNGN] = useState<string>('500');
  const [perKmFareNGN, setPerKmFareNGN] = useState<string>('120');
  const [perMinFareNGN, setPerMinFareNGN] = useState<string>('15');
  const [minFareNGN, setMinFareNGN] = useState<string>('700');
  const [nightPremium, setNightPremium] = useState<boolean>(true);
  const [surgeEnabled, setSurgeEnabled] = useState<boolean>(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const loadKekeDefaults = () => {
    setVehicleType(VehicleType.KEKE);
    setBaseFareNGN('500');
    setPerKmFareNGN('120');
    setPerMinFareNGN('15');
    setMinFareNGN('700');
    setNightPremium(true);
    setSurgeEnabled(false);
  };

  const loadSharedRideDefaults = () => {
    // Shared Ride uses keke or car, let's keep car or bike as types
    setVehicleType(VehicleType.CAR);
    setBaseFareNGN('350');
    setPerKmFareNGN('80');
    setPerMinFareNGN('0');
    setMinFareNGN('500');
    setNightPremium(true);
    setSurgeEnabled(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canEditPricing) {
      alert('You do not have permission to modify pricing configuration.');
      return;
    }

    const baseVal = parseFloat(baseFareNGN);
    const kmVal = parseFloat(perKmFareNGN);
    const minVal = parseFloat(perMinFareNGN);
    const minFareVal = parseFloat(minFareNGN);

    if (isNaN(baseVal) || isNaN(kmVal) || isNaN(minVal) || isNaN(minFareVal)) {
      setErrorMsg('All fields must be valid numeric values.');
      return;
    }

    try {
      setLoading(true);
      setErrorMsg('');
      setSuccessMsg('');

      // Send to server in Kobo (NGN * 100)
      const payload = {
        vehicleType,
        baseFare: Math.round(baseVal * 100),
        perKmFare: Math.round(kmVal * 100),
        perMinFare: Math.round(minVal * 100),
        minFare: Math.round(minFareVal * 100),
      };

      await apiService.updatePricing(payload);
      setSuccessMsg(`Pricing for ${vehicleType.toUpperCase()} updated successfully!`);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update pricing configuration.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-card shadow-custom w-full max-w-2xl">
      <div className="flex items-center gap-2 mb-6">
        <Sliders className="text-primaryGreen" size={24} />
        <h3 className="text-lg font-semibold text-darkNavy">Pricing Configuration</h3>
      </div>

      <div className="flex gap-2 mb-6">
        <button
          type="button"
          onClick={loadKekeDefaults}
          className="px-4 py-2 text-xs font-semibold rounded-button bg-lightGrey hover:bg-darkNavy hover:text-white transition-all text-darkNavy"
        >
          Load Standard Keke Preset
        </button>
        <button
          type="button"
          onClick={loadSharedRideDefaults}
          className="px-4 py-2 text-xs font-semibold rounded-button bg-lightGrey hover:bg-darkNavy hover:text-white transition-all text-darkNavy"
        >
          Load Shared Ride Preset
        </button>
      </div>

      {errorMsg && (
        <div className="mb-4 p-3 bg-red-50 border-l-4 border-error text-error text-sm rounded-r-md flex items-center gap-2">
          <AlertCircle size={16} />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="mb-4 p-3 bg-green-50 border-l-4 border-success text-success text-sm rounded-r-md flex items-center gap-2">
          <CheckCircle2 size={16} />
          <span>{successMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-darkNavy mb-1">Vehicle Type</label>
          <select
            value={vehicleType}
            onChange={(e) => setVehicleType(e.target.value as VehicleType)}
            className="w-full px-3 py-2 border border-lightGrey rounded-input focus:outline-none focus:border-primaryGreen focus:ring-1 focus:ring-primaryGreen"
          >
            <option value={VehicleType.KEKE}>Standard Keke (keke)</option>
            <option value={VehicleType.CAR}>Shared Ride / Sedan (car)</option>
            <option value={VehicleType.BIKE}>Bike (bike)</option>
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-darkNavy mb-1">
              Base Fare (₦)
            </label>
            <input
              type="number"
              step="0.01"
              value={baseFareNGN}
              onChange={(e) => setBaseFareNGN(e.target.value)}
              className="w-full px-3 py-2 border border-lightGrey rounded-input focus:outline-none focus:border-primaryGreen focus:ring-1 focus:ring-primaryGreen"
              required
            />
            <span className="text-[10px] text-gray-500">
              Equivalent: {Math.round((parseFloat(baseFareNGN) || 0) * 100)} kobo
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-darkNavy mb-1">
              Per KM Fare (₦)
            </label>
            <input
              type="number"
              step="0.01"
              value={perKmFareNGN}
              onChange={(e) => setPerKmFareNGN(e.target.value)}
              className="w-full px-3 py-2 border border-lightGrey rounded-input focus:outline-none focus:border-primaryGreen focus:ring-1 focus:ring-primaryGreen"
              required
            />
            <span className="text-[10px] text-gray-500">
              Equivalent: {Math.round((parseFloat(perKmFareNGN) || 0) * 100)} kobo
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-darkNavy mb-1">
              Per Minute Fare (₦)
            </label>
            <input
              type="number"
              step="0.01"
              value={perMinFareNGN}
              onChange={(e) => setPerMinFareNGN(e.target.value)}
              className="w-full px-3 py-2 border border-lightGrey rounded-input focus:outline-none focus:border-primaryGreen focus:ring-1 focus:ring-primaryGreen"
              required
            />
            <span className="text-[10px] text-gray-500">
              Equivalent: {Math.round((parseFloat(perMinFareNGN) || 0) * 100)} kobo
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-darkNavy mb-1">
              Minimum Fare (₦)
            </label>
            <input
              type="number"
              step="0.01"
              value={minFareNGN}
              onChange={(e) => setMinFareNGN(e.target.value)}
              className="w-full px-3 py-2 border border-lightGrey rounded-input focus:outline-none focus:border-primaryGreen focus:ring-1 focus:ring-primaryGreen"
              required
            />
            <span className="text-[10px] text-gray-500">
              Equivalent: {Math.round((parseFloat(minFareNGN) || 0) * 100)} kobo
            </span>
          </div>
        </div>

        <div className="space-y-2 border-t border-lightGrey pt-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="nightPremium"
              checked={nightPremium}
              onChange={(e) => setNightPremium(e.target.checked)}
              className="rounded text-primaryGreen focus:ring-primaryGreen"
            />
            <label htmlFor="nightPremium" className="text-xs font-semibold text-darkNavy">
              Night Premium Enabled (10 PM - 5 AM, +20%)
            </label>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="surgeEnabled"
              checked={surgeEnabled}
              onChange={(e) => setSurgeEnabled(e.target.checked)}
              className="rounded text-primaryGreen focus:ring-primaryGreen"
            />
            <label htmlFor="surgeEnabled" className="text-xs font-semibold text-darkNavy">
              Dynamic Surge Pricing Enabled (Defaults: disabled)
            </label>
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <button
            type="submit"
            disabled={loading || !canEditPricing}
            className={`px-8 py-2.5 bg-primaryGreen text-white font-semibold rounded-button text-sm transition-all hover:bg-opacity-95 shadow-sm ${
              loading || !canEditPricing ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {loading ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default PricingForm;
