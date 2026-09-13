import React, { useEffect, useState } from 'react';
import {
  Wallet,
  AlertTriangle,
  CheckCircle,
  Clock,
  DollarSign,
  Users,
  TrendingUp,
  RefreshCw,
} from 'lucide-react';

interface DriverSettlement {
  driverId: string;
  driverName: string;
  cashCollected: number;
  commissionOwed: number;
  tripsCount: number;
  status: 'outstanding' | 'partial' | 'settled';
}

interface CashDashboard {
  totalCashCollected: number;
  totalCommissionOutstanding: Kobo;
  totalDriverEarnings: number;
  unsettledTripCount: number;
  drivers: DriverSettlement[];
}

interface CashAlert {
  tripId: string;
  driverId: string;
  driverName: string;
  fare: number;
  commission: number;
  driverEarnings: number;
  settlementStatus: string;
  completedAt: string;
}

type Kobo = number;

const formatNaira = (kobo: Kobo) =>
  `₦${(kobo / 100).toLocaleString()}`;

export const CashSettlements: React.FC = () => {
  const [dashboard, setDashboard] = useState<CashDashboard | null>(null);
  const [alerts, setAlerts] = useState<CashAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<DriverSettlement | null>(null);
  const [driverLedger, setDriverLedger] = useState<any[]>([]);
  const [confirmingSettlement, setConfirmingSettlement] = useState<string | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [dashRes, alertsRes] = await Promise.all([
        fetch('/api/admin/settlements/dashboard').then((r) => r.json()),
        fetch('/api/admin/settlements/alerts?limit=20').then((r) => r.json()),
      ]);
      setDashboard(dashRes);
      setAlerts(alertsRes.items || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const loadDriverLedger = async (driverId: string) => {
    try {
      const res = await fetch(`/api/admin/settlements/drivers/${driverId}/ledger?limit=50`);
      const data = await res.json();
      setDriverLedger(data.items || []);
    } catch (err) {
      console.error('Failed to load driver ledger:', err);
    }
  };

  const confirmSettlement = async (settlementId: string) => {
    setConfirmingSettlement(settlementId);
    try {
      await fetch(`/api/admin/settlements/confirm/${settlementId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmedBy: 'admin' }),
      });
      await fetchData();
    } catch (err: any) {
      alert(`Failed to confirm: ${err.message}`);
    } finally {
      setConfirmingSettlement(null);
    }
  };

  if (isLoading && !dashboard) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-primaryGreen" size={32} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-card">
        <p className="text-red-600 font-medium">Error: {error}</p>
        <button onClick={fetchData} className="mt-2 text-sm text-red-500 underline">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-dark">Cash & Settlements</h1>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 bg-primaryGreen text-white rounded-input font-medium hover:bg-opacity-90 transition-all"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SummaryCard
          icon={<DollarSign size={24} />}
          label="Cash Collected Today"
          value={formatNaira(dashboard?.totalCashCollected || 0)}
          color="bg-green-50 text-green-600"
        />
        <SummaryCard
          icon={<AlertTriangle size={24} />}
          label="Commission Outstanding"
          value={formatNaira(dashboard?.totalCommissionOutstanding || 0)}
          color="bg-red-50 text-red-600"
        />
        <SummaryCard
          icon={<TrendingUp size={24} />}
          label="Driver Earnings"
          value={formatNaira(dashboard?.totalDriverEarnings || 0)}
          color="bg-blue-50 text-blue-600"
        />
        <SummaryCard
          icon={<Clock size={24} />}
          label="Unsettled Trips"
          value={String(dashboard?.unsettledTripCount || 0)}
          color="bg-orange-50 text-orange-600"
        />
      </div>

      {/* Driver Settlement Table */}
      <div className="bg-white rounded-card border border-lightGrey overflow-hidden">
        <div className="p-4 border-b border-lightGrey">
          <h2 className="text-lg font-semibold text-dark flex items-center gap-2">
            <Users size={20} />
            Driver Settlements
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-lightGrey bg-opacity-50">
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Driver</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">Cash Collected</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">Commission</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">Trips</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-gray-600">Status</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(dashboard?.drivers || []).map((driver) => (
                <tr key={driver.driverId} className="border-t border-lightGrey hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className="font-medium text-dark">{driver.driverName}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm">{formatNaira(driver.cashCollected)}</td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-red-600">
                    {formatNaira(driver.commissionOwed)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm">{driver.tripsCount}</td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge status={driver.status} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => {
                        setSelectedDriver(driver);
                        loadDriverLedger(driver.driverId);
                      }}
                      className="text-xs text-primaryGreen underline hover:text-primaryGreen/80"
                    >
                      View Ledger
                    </button>
                  </td>
                </tr>
              ))}
              {(!dashboard?.drivers || dashboard.drivers.length === 0) && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    No driver settlements found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Cash Trip Alerts */}
      <div className="bg-white rounded-card border border-lightGrey overflow-hidden">
        <div className="p-4 border-b border-lightGrey">
          <h2 className="text-lg font-semibold text-dark flex items-center gap-2">
            <AlertTriangle size={20} />
            Recent Cash Trip Completions
          </h2>
        </div>
        <div className="divide-y divide-lightGrey">
          {alerts.map((alert) => (
            <div key={alert.tripId} className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-orange-400 rounded-full" />
                <div>
                  <span className="text-sm font-medium text-dark">
                    {alert.driverName}
                  </span>
                  <span className="text-sm text-gray-500 ml-2">
                    Trip {alert.tripId.slice(0, 8)}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-dark">{formatNaira(alert.fare)}</div>
                <div className="text-xs text-red-500">{formatNaira(alert.commission)} commission</div>
              </div>
            </div>
          ))}
          {alerts.length === 0 && (
            <div className="px-4 py-8 text-center text-gray-400">
              No recent cash trips
            </div>
          )}
        </div>
      </div>

      {/* Driver Ledger Modal */}
      {selectedDriver && (
        <DriverLedgerModal
          driver={selectedDriver}
          ledger={driverLedger}
          onClose={() => {
            setSelectedDriver(null);
            setDriverLedger([]);
          }}
        />
      )}
    </div>
  );
};

const SummaryCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}> = ({ icon, label, value, color }) => (
  <div className="bg-white rounded-card border border-lightGrey p-4">
    <div className="flex items-center gap-3">
      <div className={`p-2 rounded-lg ${color}`}>{icon}</div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-xl font-bold text-dark">{value}</p>
      </div>
    </div>
  </div>
);

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const styles = {
    outstanding: 'bg-red-100 text-red-700',
    partial: 'bg-orange-100 text-orange-700',
    settled: 'bg-green-100 text-green-700',
  };
  const labels = {
    outstanding: 'Owed',
    partial: 'Partial',
    settled: 'Settled',
  };
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status as keyof typeof styles] || 'bg-gray-100 text-gray-700'}`}>
      {labels[status as keyof typeof labels] || status}
    </span>
  );
};

const DriverLedgerModal: React.FC<{
  driver: DriverSettlement;
  ledger: any[];
  onClose: () => void;
}> = ({ driver, ledger, onClose }) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-card max-w-2xl w-full max-h-[80vh] overflow-hidden">
      <div className="p-4 border-b border-lightGrey flex items-center justify-between">
        <h3 className="text-lg font-semibold text-dark">
          {driver.driverName} — Ledger
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-dark">
          ✕
        </button>
      </div>
      <div className="p-4 border-b border-lightGrey bg-gray-50">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Cash Collected</p>
            <p className="font-bold">{formatNaira(driver.cashCollected)}</p>
          </div>
          <div>
            <p className="text-gray-500">Commission Owed</p>
            <p className="font-bold text-red-600">{formatNaira(driver.commissionOwed)}</p>
          </div>
          <div>
            <p className="text-gray-500">Trips</p>
            <p className="font-bold">{driver.tripsCount}</p>
          </div>
        </div>
      </div>
      <div className="overflow-y-auto max-h-[50vh]">
        {ledger.map((entry) => (
          <div key={entry.id} className="px-4 py-3 border-b border-lightGrey flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-dark">{entry.description}</p>
              <p className="text-xs text-gray-400">
                {new Date(entry.createdAt).toLocaleString()}
              </p>
            </div>
            <div className="text-right">
              <p className={`text-sm font-medium ${entry.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {entry.amount >= 0 ? '+' : ''}{formatNaira(entry.amount)}
              </p>
              <p className="text-xs text-gray-400">
                Balance: {formatNaira(entry.balanceAfter)}
              </p>
            </div>
          </div>
        ))}
        {ledger.length === 0 && (
          <div className="px-4 py-8 text-center text-gray-400">
            No ledger entries found
          </div>
        )}
      </div>
    </div>
  </div>
);

export default CashSettlements;
