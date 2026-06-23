import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

interface ProtectedRouteProps {
  allowedRoles?: Array<'super_admin' | 'admin' | 'moderator'>;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ allowedRoles }) => {
  const { isAuthenticated, admin, isInitializing } = useAuthStore();

  if (isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-lightGrey">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-primaryGreen"></div>
      </div>
    );
  }

  if (!isAuthenticated || !admin) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(admin.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
