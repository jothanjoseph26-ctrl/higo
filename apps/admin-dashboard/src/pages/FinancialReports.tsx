import React, { useEffect, useState } from 'react';
import { DateRangePicker } from '../components/DateRangePicker';
import { ExportButton } from '../components/ExportButton';
import { apiService } from '../services/api';
import { FinancialReportResponse } from '@higo/shared-types';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Printer, AlertCircle, RefreshCw } from 'lucide-react';

const COLORS = ['#0B6E4F', '#FF7A00', '#0A2540'];

export const FinancialReports: React.FC = () => {
  const [startDate, setStartDate] = useState<Date | null>(() => {
    const d = new Date();
    d.setDate(1); // Default to start of month
    return d;
  });
  const [endDate, setEndDate] = useState<Date | null>(new Date());
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');

  const [report, setReport] = useState<FinancialReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = async () => {
    try {
      setLoading(true);
      setError(null);
      const query = {
        from: startDate ? startDate.toISOString() : undefined,
        to: endDate ? endDate.toISOString() : undefined,
        groupBy,
      };
      const data = await apiService.getFinancialReport(query);
      setReport(data);
    } catch (err: any) {
      setReport(null);
      setError(err?.message || 'Failed to load financial report.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [startDate, endDate, groupBy]);

  const handleDateChange = (start: Date | null, end: Date | null) => {
    setStartDate(start);
    setEndDate(end);
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-primaryGreen"></div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-darkNavy font-poppins">Financial Reports</h1>
          <p className="text-xs text-gray-500">Track commissions, platform revenue, and subscriptions</p>
        </div>
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
          <div className="p-4 bg-red-50 border border-red-200 rounded-card text-error text-sm flex items-center gap-2 max-w-md">
            <AlertCircle size={20} />
            <span>{error || 'Unable to load financial report.'}</span>
          </div>
          <button
            onClick={fetchReport}
            className="px-4 py-2 bg-primaryGreen text-white rounded-button text-xs font-semibold hover:bg-opacity-95 flex items-center gap-2"
          >
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  const formatNGN = (kobo: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(kobo / 100);
  };

  const formattedSeries = report.series.map((item) => ({
    Period: item.period,
    Gross: item.gross / 100,
    Payout: item.driverPayout / 100,
    Commission: item.platformFee / 100,
    Trips: item.trips,
  }));

  const subscriptionBreakdown = report.totals.subscriptionRevenue > 0
    ? [{ name: 'Total Subscription Revenue', value: report.totals.subscriptionRevenue }]
    : [];

  return (
    <div className="space-y-6 print:p-0 print:space-y-4">
      {/* Header section (Hidden on print or styled cleanly) */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-lightGrey pb-4 print:border-b-2">
        <div>
          <h1 className="text-2xl font-bold text-darkNavy font-poppins">Financial Reports</h1>
          <p className="text-xs text-gray-500">Track commissions, platform revenue, and subscriptions</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <DateRangePicker startDate={startDate} endDate={endDate} onChange={handleDateChange} />
          
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as any)}
            className="px-3 py-2 border border-lightGrey rounded-input text-xs font-semibold focus:outline-none bg-white shadow-sm h-10"
          >
            <option value="day">Group by Day</option>
            <option value="week">Group by Week</option>
            <option value="month">Group by Month</option>
          </select>

          <ExportButton data={report.series} filename={`financial-series-${groupBy}.csv`} />

          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 border border-lightGrey bg-white text-darkNavy rounded-button font-medium text-xs hover:bg-lightGrey transition-all shadow-sm h-10"
          >
            <Printer size={16} />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* Printable header info */}
      <div className="hidden print:block text-xs text-dark mb-4">
        <h2 className="text-lg font-bold text-darkNavy mb-1">HiGo Abuja Financial Statement</h2>
        <p><strong>Reporting Period:</strong> {startDate?.toLocaleDateString()} to {endDate?.toLocaleDateString()}</p>
        <p><strong>Generated At:</strong> {new Date().toLocaleString()}</p>
      </div>

      {/* Totals Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="bg-white p-4 rounded-card border border-lightGrey shadow-custom print:border-2">
          <span className="text-[10px] font-semibold text-gray-500 block mb-1 uppercase">Gross Fares</span>
          <span className="text-sm font-bold text-darkNavy block">{formatNGN(report.totals.gross)}</span>
        </div>

        <div className="bg-white p-4 rounded-card border border-lightGrey shadow-custom print:border-2">
          <span className="text-[10px] font-semibold text-gray-500 block mb-1 uppercase">Commission (5%)</span>
          <span className="text-sm font-bold text-primaryGreen block">{formatNGN(report.totals.platformFee)}</span>
        </div>

        <div className="bg-white p-4 rounded-card border border-lightGrey shadow-custom print:border-2">
          <span className="text-[10px] font-semibold text-gray-500 block mb-1 uppercase">Driver Payouts</span>
          <span className="text-sm font-bold text-darkNavy block">{formatNGN(report.totals.driverPayout)}</span>
        </div>

        <div className="bg-white p-4 rounded-card border border-lightGrey shadow-custom print:border-2">
          <span className="text-[10px] font-semibold text-gray-500 block mb-1 uppercase">Subscription Revenue</span>
          <span className="text-sm font-bold text-primaryGreen block">{formatNGN(report.totals.subscriptionRevenue)}</span>
        </div>

        <div className="bg-white p-4 rounded-card border border-lightGrey shadow-custom print:border-2">
          <span className="text-[10px] font-semibold text-gray-500 block mb-1 uppercase">Refund Volume</span>
          <span className="text-sm font-bold text-error block">{formatNGN(report.totals.refunds)}</span>
        </div>

        <div className="bg-white p-4 rounded-card border border-lightGrey shadow-custom print:border-2">
          <span className="text-[10px] font-semibold text-gray-500 block mb-1 uppercase">Completed Rides</span>
          <span className="text-sm font-bold text-darkNavy block">{report.totals.trips}</span>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 print:block print:space-y-6">
        {/* Ride earnings chart */}
        <div className="bg-white p-6 rounded-card border border-lightGrey shadow-custom lg:col-span-2 print:border-2">
          <h3 className="text-xs font-bold text-darkNavy mb-4 uppercase tracking-wider">Ride Fares vs Payouts vs Commissions (₦)</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={formattedSeries} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F2F4F7" />
                <XAxis dataKey="Period" stroke="#98A2B3" fontSize={10} />
                <YAxis stroke="#98A2B3" fontSize={10} />
                <Tooltip formatter={(value) => `₦${Number(value).toLocaleString()}`} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="Gross" fill="#0A2540" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Payout" fill="#0B6E4F" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Commission" fill="#FF7A00" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Subscription revenue summary */}
        <div className="bg-white p-6 rounded-card border border-lightGrey shadow-custom print:border-2">
          <h3 className="text-xs font-bold text-darkNavy mb-4 uppercase tracking-wider">Subscription Revenue</h3>
          <div className="h-72 flex flex-col justify-center items-center">
            {subscriptionBreakdown.length > 0 ? (
              <>
                <div className="w-full h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={subscriptionBreakdown}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {subscriptionBreakdown.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => `₦${(Number(value) / 100).toLocaleString()}`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1 w-full text-xs font-semibold">
                  {subscriptionBreakdown.map((plan, index) => (
                    <div key={plan.name} className="flex justify-between items-center text-[10px]">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                        <span>{plan.name}</span>
                      </div>
                      <span className="text-darkNavy">₦{(plan.value / 100).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-gray-500 text-center">No subscription revenue recorded for this period.</p>
            )}
          </div>
        </div>
      </div>

      {/* Aggregate breakdown table */}
      <div className="bg-white rounded-card border border-lightGrey shadow-custom overflow-hidden print:border-2">
        <div className="bg-lightGrey p-4 border-b border-lightGrey flex justify-between items-center print:bg-transparent">
          <h3 className="text-xs font-bold text-darkNavy uppercase tracking-wider">Periodic Aggregated Totals</h3>
          <span className="text-[10px] text-gray-500 font-semibold print:hidden">Grouped by {groupBy}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-lightGrey bg-opacity-50 font-semibold border-b border-lightGrey">
                <th className="px-6 py-3 text-darkNavy uppercase">Period</th>
                <th className="px-6 py-3 text-darkNavy uppercase">Completed Trips</th>
                <th className="px-6 py-3 text-darkNavy uppercase">Gross Fares (₦)</th>
                <th className="px-6 py-3 text-darkNavy uppercase">Driver Payouts (₦)</th>
                <th className="px-6 py-3 text-darkNavy uppercase">Platform Fee (₦)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-lightGrey">
              {report.series.map((item, idx) => (
                <tr key={idx} className="hover:bg-lightGrey hover:bg-opacity-30 transition-colors font-medium">
                  <td className="px-6 py-3 text-darkNavy font-bold">{item.period}</td>
                  <td className="px-6 py-3">{item.trips}</td>
                  <td className="px-6 py-3">{formatNGN(item.gross)}</td>
                  <td className="px-6 py-3">{formatNGN(item.driverPayout)}</td>
                  <td className="px-6 py-3 text-primaryGreen font-semibold">{formatNGN(item.platformFee)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default FinancialReports;
