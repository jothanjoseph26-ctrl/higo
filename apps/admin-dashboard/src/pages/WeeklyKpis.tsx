import React, { useEffect, useState } from 'react';
import { apiService } from '../services/api';
import {
  AdminGetWeeklyKpisHistoryResponse,
  AdminGetWeeklyKpisResponse,
} from '@higo/shared-types';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  AlertCircle,
  BarChart3,
  Clock,
  Loader2,
  RefreshCw,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';

type KpiStatus = 'green' | 'amber' | 'red';

const STATUS_STYLES: Record<KpiStatus, string> = {
  green: 'bg-green-50 border-green-200 text-green-800',
  amber: 'bg-amber-50 border-amber-200 text-amber-800',
  red: 'bg-red-50 border-red-200 text-red-800',
};

const STATUS_DOT: Record<KpiStatus, string> = {
  green: 'bg-success',
  amber: 'bg-warning',
  red: 'bg-error',
};

function statusDriverActiveRate(value: number): KpiStatus {
  if (value >= 0.3) return 'green';
  if (value >= 0.15) return 'amber';
  return 'red';
}

function statusCompletionRate(value: number): KpiStatus {
  if (value >= 0.85) return 'green';
  if (value >= 0.7) return 'amber';
  return 'red';
}

function statusWaitMinutes(value: number): KpiStatus {
  if (value <= 8) return 'green';
  if (value <= 15) return 'amber';
  return 'red';
}

function statusCac(kobo: number): KpiStatus {
  if (kobo <= 0) return 'green';
  if (kobo <= 500_000) return 'green';
  if (kobo <= 1_500_000) return 'amber';
  return 'red';
}

function statusBurnRatio(value: number): KpiStatus {
  if (value <= 1) return 'green';
  if (value <= 2) return 'amber';
  return 'red';
}

const formatPct = (value: number) => `${(value * 100).toFixed(1)}%`;
const formatNgn = (kobo: number) =>
  `₦${(kobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;

export const WeeklyKpis: React.FC = () => {
  const [current, setCurrent] = useState<AdminGetWeeklyKpisResponse | null>(null);
  const [history, setHistory] = useState<AdminGetWeeklyKpisHistoryResponse['weeks']>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [kpi, hist] = await Promise.all([
        apiService.getWeeklyKpis(),
        apiService.getWeeklyKpisHistory(12),
      ]);
      setCurrent(kpi);
      setHistory(hist.weeks);
    } catch (err: any) {
      setCurrent(null);
      setHistory([]);
      setError(err?.message || 'Failed to load weekly KPIs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <Loader2 className="animate-spin text-primaryGreen" size={40} />
      </div>
    );
  }

  if (error || !current) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] gap-4">
        <div className="p-4 bg-red-50 border border-red-200 rounded-card text-error text-sm flex items-center gap-2 max-w-md">
          <AlertCircle size={20} />
          <span>{error || 'Unable to load weekly KPIs.'}</span>
        </div>
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-primaryGreen text-white rounded-button text-xs font-semibold hover:bg-opacity-95 flex items-center gap-2"
        >
          <RefreshCw size={14} />
          Retry
        </button>
      </div>
    );
  }

  const cards = [
    {
      title: 'Driver Active Rate',
      value: formatPct(current.driverActiveRate),
      status: statusDriverActiveRate(current.driverActiveRate),
      hint: 'Drivers with 3+ trips / total registered',
      icon: Users,
    },
    {
      title: 'Ride Completion Rate',
      value: formatPct(current.rideCompletionRate),
      status: statusCompletionRate(current.rideCompletionRate),
      hint: 'Completed / requested trips',
      icon: Target,
    },
    {
      title: 'Avg Passenger Wait',
      value: `${current.avgPassengerWaitMinutes.toFixed(1)} min`,
      status: statusWaitMinutes(current.avgPassengerWaitMinutes),
      hint: 'Request to trip start',
      icon: Clock,
    },
    {
      title: 'Customer Acquisition Cost',
      value: formatNgn(current.customerAcquisitionCost),
      status: statusCac(current.customerAcquisitionCost),
      hint: 'Weekly marketing / new passengers',
      icon: TrendingUp,
    },
    {
      title: 'Cash Burn vs Revenue',
      value: `${current.cashBurnVsRevenue.toFixed(2)}x`,
      status: statusBurnRatio(current.cashBurnVsRevenue),
      hint: 'Operating costs / net revenue',
      icon: BarChart3,
    },
  ];

  const chartData = history.map((week) => ({
    week: week.weekEnding.slice(5),
    driverActiveRate: Number((week.driverActiveRate * 100).toFixed(1)),
    rideCompletionRate: Number((week.rideCompletionRate * 100).toFixed(1)),
    avgWait: Number(week.avgPassengerWaitMinutes.toFixed(1)),
    burnRatio: Number(week.cashBurnVsRevenue.toFixed(2)),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-darkNavy font-poppins">Weekly KPIs</h1>
          <p className="text-xs text-gray-500">
            Week ending {current.period.to.slice(0, 10)} · emailed Fridays 8pm WAT via Resend
          </p>
        </div>
        <button
          onClick={fetchData}
          className="px-3 py-2 border border-gray-200 rounded-button text-xs font-semibold text-darkNavy hover:bg-lightGrey flex items-center gap-2"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.title}
              className={`rounded-card border p-4 shadow-card ${STATUS_STYLES[card.status]}`}
            >
              <div className="flex items-center justify-between mb-2">
                <Icon size={18} />
                <span
                  className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[card.status]}`}
                  title={card.status}
                />
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
                {card.title}
              </p>
              <p className="text-2xl font-bold mt-1">{card.value}</p>
              <p className="text-[10px] mt-2 opacity-70">{card.hint}</p>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-card border border-gray-100 shadow-card p-5">
        <h2 className="text-sm font-bold text-darkNavy mb-1">12-Week Trend</h2>
        <p className="text-[11px] text-gray-500 mb-4">
          Driver active %, completion %, wait time (min), and burn ratio
        </p>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F2F4F7" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="driverActiveRate"
                name="Driver Active %"
                stroke="#0B6E4F"
                strokeWidth={2}
                dot={false}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="rideCompletionRate"
                name="Completion %"
                stroke="#FF7A00"
                strokeWidth={2}
                dot={false}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="avgWait"
                name="Avg Wait (min)"
                stroke="#0A2540"
                strokeWidth={2}
                dot={false}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="burnRatio"
                name="Burn Ratio"
                stroke="#DC2626"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default WeeklyKpis;