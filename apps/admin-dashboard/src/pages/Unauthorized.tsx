import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';

export const Unauthorized: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-lightGrey flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md p-8 rounded-card shadow-custom text-center border border-lightGrey">
        <div className="w-16 h-16 bg-red-50 text-error rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
          <ShieldAlert size={32} />
        </div>
        <h2 className="text-xl font-bold text-darkNavy font-poppins">Access Restrained</h2>
        <p className="text-sm text-gray-500 mt-2">
          Your admin role profile is not authorized to access this section or control panel.
        </p>

        <button
          onClick={() => navigate('/')}
          className="mt-6 px-6 py-2.5 bg-primaryGreen text-white font-semibold rounded-button text-sm transition-all hover:bg-opacity-95 shadow-sm"
        >
          Return to Overview
        </button>
      </div>
    </div>
  );
};

export default Unauthorized;
