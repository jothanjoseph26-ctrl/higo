import { createBrowserRouter } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import DashboardLayout from '../layouts/DashboardLayout';

// Pages
import DashboardOverview from '../pages/DashboardOverview';
import OperationsMap from '../pages/OperationsMap';
import DriverManagement from '../pages/DriverManagement';
import PassengerManagement from '../pages/PassengerManagement';
import PricingConfig from '../pages/PricingConfig';
import FinancialReports from '../pages/FinancialReports';
import Disputes from '../pages/Disputes';
import ZonesGeofencing from '../pages/ZonesGeofencing';
import Notifications from '../pages/Notifications';
import Settings from '../pages/Settings';
import Login from '../pages/Login';
import Unauthorized from '../pages/Unauthorized';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/unauthorized',
    element: <Unauthorized />,
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <DashboardLayout />,
        children: [
          {
            path: '/',
            element: <DashboardOverview />,
          },
          {
            path: '/operations-map',
            element: <OperationsMap />,
          },
          {
            path: '/drivers',
            element: <DriverManagement />,
          },
          {
            path: '/passengers',
            element: <PassengerManagement />,
          },
          {
            path: '/pricing',
            element: <PricingConfig />,
          },
          {
            path: '/financial-reports',
            element: <FinancialReports />,
          },
          {
            path: '/disputes',
            element: <Disputes />,
          },
          {
            path: '/zones',
            element: <ZonesGeofencing />,
          },
          {
            path: '/notifications',
            element: <Notifications />,
          },
          {
            path: '/settings',
            element: <Settings />,
          },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <Login />,
  },
]);

export default router;
