import React from 'react';
import PricingForm from '../components/PricingForm';
import { Info, HelpCircle } from 'lucide-react';

export const PricingConfig: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-darkNavy">Pricing Configuration</h1>
        <p className="text-xs text-gray-500">Configure base fares, per-KM, per-minute, and minimum ride parameters in Kobo</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Pricing Form Section */}
        <div className="lg:col-span-2">
          <PricingForm />
        </div>

        {/* Informative Side Panel */}
        <div className="bg-white p-6 rounded-card shadow-custom border border-lightGrey space-y-4">
          <h3 className="font-semibold text-sm text-darkNavy border-b border-lightGrey pb-2 flex items-center gap-1.5">
            <HelpCircle className="text-accentOrange" size={16} />
            <span>Pricing Guidelines</span>
          </h3>

          <div className="space-y-3 text-xs text-dark font-medium leading-relaxed">
            <div className="p-3 bg-lightGrey rounded-input">
              <span className="font-bold text-darkNavy block mb-1">Abuja Legally Mandated Presets</span>
              <ul className="list-disc pl-4 space-y-1">
                <li>Keke Base Fare: ₦500 (50,000 kobo)</li>
                <li>Keke Per KM: ₦120 (12,000 kobo)</li>
                <li>Keke Per Min: ₦15 (1,500 kobo)</li>
                <li>Keke Minimum Fare: ₦700 (70,000 kobo)</li>
              </ul>
            </div>

            <div className="p-3 bg-lightGrey rounded-input">
              <span className="font-bold text-darkNavy block mb-1">Shared Rides Presets</span>
              <ul className="list-disc pl-4 space-y-1">
                <li>Base Fare: ₦350 (35,000 kobo)</li>
                <li>Per KM: ₦80 (8,000 kobo)</li>
                <li>Minimum Fare: ₦500 (50,000 kobo)</li>
              </ul>
            </div>

            <p className="text-gray-500">
              <strong className="text-darkNavy">Float Rounding Policy:</strong> Always calculate and submit values to the server in integers (Kobo). The interface automatically handles translations between Naira (₦) and Kobo (₦1 = 100 kobo) to prevent floating-point rounding mismatches in final fare computations.
            </p>

            <div className="flex items-start gap-2 p-3 bg-yellow-50 text-warning border-l-4 border-warning rounded-r-md">
              <Info className="flex-shrink-0 mt-0.5" size={14} />
              <p className="text-[10px] leading-tight">
                Any modifications made here will directly alter the live estimation calculations. Changes require <strong>Admin</strong> or <strong>Super Admin</strong> status permissions.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PricingConfig;
