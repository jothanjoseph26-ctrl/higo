import React from 'react';
import { useAuthStore } from '../stores/authStore';
import { apiService } from '../services/api';
import { LogOut, User as UserIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const Topbar: React.FC = () => {
  const { admin, clearAuth } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await apiService.logout();
      clearAuth();
      navigate('/login');
    } catch (err) {
      console.error('Logout error:', err);
      clearAuth();
      navigate('/login');
    }
  };

  return (
    <header className="bg-white border-b border-lightGrey h-16 flex items-center justify-between px-6 sticky top-0 z-30">
      <div className="flex items-center">
        <h2 className="font-semibold text-lg text-darkNavy">Operations Control Center</h2>
      </div>

      <div className="flex items-center gap-4">
        {admin && (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-lightGrey flex items-center justify-center text-darkNavy border border-lightGrey">
              <UserIcon size={18} />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-darkNavy">{admin.name}</span>
              <span className="text-[10px] text-gray-500 capitalize">{admin.role.replace('_', ' ')}</span>
            </div>
          </div>
        )}

        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-error hover:bg-red-50 rounded-button transition-all border border-transparent hover:border-red-100 font-semibold"
        >
          <LogOut size={14} />
          <span>Logout</span>
        </button>
      </div>
    </header>
  );
};

export default Topbar;
