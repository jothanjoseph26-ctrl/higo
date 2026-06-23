import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { useUiStore } from '../stores/uiStore';
import { X, CheckCircle, AlertTriangle, Info, AlertOctagon } from 'lucide-react';

export const DashboardLayout: React.FC = () => {
  const { toasts, removeToast } = useUiStore();

  const getToastIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="text-success" size={18} />;
      case 'error':
        return <AlertOctagon className="text-error" size={18} />;
      case 'warning':
        return <AlertTriangle className="text-warning" size={18} />;
      default:
        return <Info className="text-blue-500" size={18} />;
    }
  };

  return (
    <div className="flex bg-lightGrey min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="flex items-start gap-3 p-4 bg-white border border-lightGrey rounded-card shadow-custom"
          >
            <div className="flex-shrink-0 mt-0.5">{getToastIcon(toast.type)}</div>
            <div className="flex-1 text-sm font-medium text-dark">{toast.message}</div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-gray-400 hover:text-dark transition-all flex-shrink-0"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DashboardLayout;
