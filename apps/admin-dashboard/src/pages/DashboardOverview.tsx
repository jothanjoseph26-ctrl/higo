import React, { useEffect, useState } from 'react';
import { apiService } from '../services/api';
import { DashboardOverviewResponse } from '@higo/shared-types';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Cell,
  Pie,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  Activity,
  Users,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  ClipboardList,
  Loader2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

const COLORS = ['#0B6E4F', '#FF7A00', '#0A2540', '#16A34A', '#F59E0B', '#DC2626'];

export const DashboardOverview: React.FC = () => {
  const [data, setData] = useState<DashboardOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiService.getDashboardOverview();
      setData(res);
    } catch (err: any) {
      setData(null);
      setError(err?.message || 'Failed to load dashboard overview.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <Loader2 className="animate-spin text-primaryGreen" size={40} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] gap-4">
        <div className="p-4 bg-red-50 border border-red-200 rounded-card text-error text-sm flex items-center gap-2 max-w-md">
          <AlertCircle size={20} />
          <span>{error || 'Unable to load dashboard data.'}</span>
        </div>
        <button
          onClick={fetchOverview}
          className="px-4 py-2 bg-primaryGreen text-white rounded-button text-xs font-semibold hover:bg-opacity-95 flex items-center gap-2"
        >
          <RefreshCw size={14} />
          Retry
        </button>
      </div>
    );
  }

  // Formatting helper: Kobo to NGN
  const formatNGN = (kobo: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(kobo / 100);
  };

  const statCards = [
    { title: 'Active Trips', value: data.activeTrips, icon: Activity, color: 'text-primaryGreen' },
    { title: 'Online Drivers', value: data.onlineDrivers, icon: Users, color: 'text-darkNavy' },
    { title: 'Approved Drivers', value: data.totalDriversApproved, icon: ShieldCheck, color: 'text-primaryGreen' },
    { title: 'Total Passengers', value: data.totalPassengers, icon: Users, color: 'text-darkNavy' },
    { title: 'Today\'s Revenue', value: formatNGN(data.grossRevenueToday), icon: TrendingUp, color: 'text-primaryGreen' },
    { title: 'Commission (5%)', value: formatNGN(data.platformFeeToday), icon: TrendingUp, color: 'text-primaryGreen' },
    { title: 'Open Disputes', value: data.openDisputes, icon: AlertTriangle, color: 'text-error font-semibold' },
    { title: 'KYC Pending Queue', value: data.pendingKyc, icon: ClipboardList, color: 'text-accentOrange font-semibold' },
  ];

  // Convert gross/fee to NGN for earningsTrend chart display
  const chartEarningsData = data.earningsTrend.map((item) => ({
    date: item.date,
    Gross: item.gross / 100,
    Commission: item.fee / 100,
  }));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-darkNavy">Operations Overview</h1>
          <p className="text-xs text-gray-500">Live operational stats and financial dashboards</p>
        </div>
        <button
          onClick={fetchOverview}
          className="px-4 py-2 border border-lightGrey bg-white rounded-button text-xs font-semibold hover:bg-lightGrey transition-all shadow-sm"
        >
          Refresh Data
        </button>
      </div>

      {/* Stats Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.title} className="bg-white p-5 rounded-card shadow-custom border border-lightGrey flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-gray-500 block mb-1">{card.title}</span>
                <span className={`text-xl font-bold ${card.color}`}>{card.value}</span>
              </div>
              <div className="p-3 bg-lightGrey rounded-input">
                <Icon className={card.color.split(' ')[0]} size={20} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Recharts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AreaChart: Trips Trend */}
        <div className="bg-white p-6 rounded-card shadow-custom border border-lightGrey">
          <h3 className="text-sm font-semibold text-darkNavy mb-4">Trip Volume Trend</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.tripTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorTrips" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0B6E4F" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#0B6E4F" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F2F4F7" />
                <XAxis dataKey="date" stroke="#98A2B3" fontSize={10} />
                <YAxis stroke="#98A2B3" fontSize={10} />
                <Tooltip />
                <Area type="monotone" dataKey="trips" stroke="#0B6E4F" strokeWidth={2} fillOpacity={1} fill="url(#colorTrips)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* BarChart: Earnings Trend */}
        <div className="bg-white p-6 rounded-card shadow-custom border border-lightGrey">
          <h3 className="text-sm font-semibold text-darkNavy mb-4">Revenue & Commissions (₦)</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartEarningsData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F2F4F7" />
                <XAxis dataKey="date" stroke="#98A2B3" fontSize={10} />
                <YAxis stroke="#98A2B3" fontSize={10} />
                <Tooltip formatter={(value) => `₦${Number(value).toLocaleString()}`} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="Gross" fill="#0B6E4F" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Commission" fill="#FF7A00" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* PieChart: Zone Distribution */}
        <div className="bg-white p-6 rounded-card shadow-custom border border-lightGrey lg:col-span-2">
          <h3 className="text-sm font-semibold text-darkNavy mb-4 font-poppins">Ride Distribution across Zones</h3>
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="flex-1 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.zoneDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="trips"
                    nameKey="zoneName"
                  >
                    {data.zoneDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `${value} rides`} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            
            {/* Zone breakdown table */}
            <div className="w-full md:w-80">
              <div className="border border-lightGrey rounded-input overflow-hidden text-xs">
                <div className="bg-lightGrey p-2.5 font-semibold text-darkNavy border-b border-lightGrey flex justify-between">
                  <span>Zone Geofence</span>
                  <span>Rides Segment</span>
                </div>
                <div className="divide-y divide-lightGrey">
                  {data.zoneDistribution.map((zone, index) => (
                    <div key={zone.zoneName} className="p-2.5 flex justify-between items-center">
                      <div className="flex items-center gap-1.5 font-medium">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                        <span>{zone.zoneName}</span>
                      </div>
                      <span className="font-bold text-darkNavy">{zone.trips}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardOverview;
