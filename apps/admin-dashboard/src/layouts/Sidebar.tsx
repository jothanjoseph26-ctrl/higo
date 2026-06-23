import React from 'react';
import { NavLink } from 'react-router-dom';
import { usePermissions } from '../hooks/usePermissions';
import { useUiStore } from '../stores/uiStore';
import {
  LayoutDashboard,
  Map,
  Users,
  UserCheck,
  CreditCard,
  Scale,
  MapPin,
  Megaphone,
  Settings as SettingsIcon,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const { sidebarOpen, toggleSidebar } = useUiStore();
  const { role } = usePermissions();

  const links = [
    { to: '/', label: 'Overview', icon: LayoutDashboard },
    { to: '/operations-map', label: 'Operations Map', icon: Map },
    { to: '/drivers', label: 'Drivers (KYC)', icon: UserCheck },
    { to: '/passengers', label: 'Passengers', icon: Users },
    { to: '/pricing', label: 'Pricing Config', icon: CreditCard, roles: ['super_admin', 'admin'] },
    { to: '/financial-reports', label: 'Financials', icon: TrendingUp },
    { to: '/disputes', label: 'Disputes', icon: Scale },
    { to: '/zones', label: 'Zones/Geofencing', icon: MapPin },
    { to: '/notifications', label: 'Broadcasts', icon: Megaphone },
    { to: '/settings', label: 'Settings', icon: SettingsIcon },
  ];

  return (
    <aside
      className={`bg-darkNavy text-white flex flex-col transition-all duration-300 h-screen sticky top-0 ${
        sidebarOpen ? 'w-64' : 'w-20'
      }`}
    >
      <div className="flex items-center justify-between p-4 border-b border-white border-opacity-10 h-16">
        {sidebarOpen && (
          <span className="font-bold text-lg tracking-wider text-primaryGreen">HiGo Admin</span>
        )}
        <button
          onClick={toggleSidebar}
          className="p-1 hover:bg-white hover:bg-opacity-10 rounded-full transition-all ml-auto"
        >
          {sidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
        </button>
      </div>

      <nav className="flex-1 py-4 space-y-1 overflow-y-auto px-3">
        {links.map((link) => {
          if (link.roles && role && !link.roles.includes(role)) {
            return null;
          }
          const Icon = link.icon;
          return (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-3 rounded-input font-medium text-sm transition-all ${
                  isActive
                    ? 'bg-primaryGreen text-white'
                    : 'text-gray-300 hover:bg-white hover:bg-opacity-10 hover:text-white'
                }`
              }
            >
              <Icon size={20} />
              {sidebarOpen && <span>{link.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white border-opacity-10 text-xs text-gray-400 text-center">
        {sidebarOpen ? `Role: ${role?.replace('_', ' ')}` : role?.substring(0, 3).toUpperCase()}
      </div>
    </aside>
  );
};

export default Sidebar;
