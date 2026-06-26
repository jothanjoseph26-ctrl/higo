import React from 'react';
import { useCursorTable } from '../hooks/useCursorTable';
import { apiService } from '../services/api';
import { TransactionEntry } from '@higo/shared-types';
import DataTable from '../components/DataTable';
import { ColumnDef } from '@tanstack/react-table';
import { Receipt, RefreshCw } from 'lucide-react';

const formatNGN = (kobo: number) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 2,
  }).format(kobo / 100);

const typeBadge = (type: TransactionEntry['type']) => {
  const styles: Record<TransactionEntry['type'], string> = {
    charge: 'bg-blue-50 text-blue-700 border-blue-200',
    refund: 'bg-red-50 text-error border-red-200',
    transfer: 'bg-green-50 text-success border-green-200',
    subscription: 'bg-purple-50 text-purple-700 border-purple-200',
  };
  return (
    <span className={`px-2 py-0.5 rounded-button text-[10px] font-semibold border capitalize ${styles[type]}`}>
      {type}
    </span>
  );
};

export const TransactionLogs: React.FC = () => {
  const fetchTransactions = async (params: Record<string, unknown>) => {
    return apiService.getTransactions({
      limit: params.limit as number,
      cursor: params.cursor as string | undefined,
      type: (params.type as TransactionEntry['type']) || undefined,
      status: (params.status as string) || undefined,
    });
  };

  const {
    data: transactions,
    loading,
    filters,
    updateFilters,
    hasNextPage,
    hasPrevPage,
    handleNextPage,
    handlePrevPage,
    refresh,
  } = useCursorTable<TransactionEntry>({
    fetchFn: fetchTransactions,
    initialLimit: 20,
    initialFilters: { type: '', status: '' },
  });

  const columns: ColumnDef<TransactionEntry>[] = [
    {
      accessorKey: 'reference',
      header: 'Reference',
      cell: (info) => (
        <span className="font-mono text-xs font-semibold text-darkNavy">
          {info.row.original.reference.substring(0, 16)}...
        </span>
      ),
    },
    {
      accessorKey: 'type',
      header: 'Type',
      cell: (info) => typeBadge(info.row.original.type),
    },
    {
      accessorKey: 'tripId',
      header: 'Trip',
      cell: (info) => (
        <span className="text-xs text-gray-500 font-medium">
          {info.row.original.tripId ? `${info.row.original.tripId.substring(0, 8)}...` : '—'}
        </span>
      ),
    },
    {
      accessorKey: 'amount',
      header: 'Amount',
      cell: (info) => (
        <span className="text-xs font-bold text-darkNavy">{formatNGN(info.row.original.amount)}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: (info) => (
        <span className="text-xs font-semibold capitalize text-gray-600">{info.row.original.status}</span>
      ),
    },
    {
      accessorKey: 'method',
      header: 'Method',
      cell: (info) => (
        <span className="text-xs capitalize">{info.row.original.method ?? '—'}</span>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Date',
      cell: (info) => (
        <span className="text-xs text-gray-500">
          {new Date(info.row.original.createdAt).toLocaleString()}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-darkNavy flex items-center gap-2">
            <Receipt size={24} className="text-primaryGreen" />
            Transaction Logs
          </h1>
          <p className="text-xs text-gray-500">
            Paginated audit trail of charges, transfers, subscriptions, and refunds
          </p>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-lightGrey rounded-button text-xs font-semibold hover:bg-lightGrey transition-all self-start"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      <DataTable
        columns={columns}
        data={transactions}
        loading={loading}
        hasNextPage={hasNextPage}
        hasPrevPage={hasPrevPage}
        onNextPage={handleNextPage}
        onPrevPage={handlePrevPage}
        filtersNode={
          <>
            <select
              value={filters.type}
              onChange={(e) => updateFilters({ type: e.target.value })}
              className="px-3 py-1.5 text-xs border border-lightGrey rounded-input focus:outline-none"
            >
              <option value="">All Types</option>
              <option value="charge">Charge</option>
              <option value="refund">Refund</option>
              <option value="transfer">Transfer</option>
              <option value="subscription">Subscription</option>
            </select>
            <select
              value={filters.status}
              onChange={(e) => updateFilters({ status: e.target.value })}
              className="px-3 py-1.5 text-xs border border-lightGrey rounded-input focus:outline-none"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="held">Held</option>
              <option value="released">Released</option>
              <option value="refunded">Refunded</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
            </select>
          </>
        }
      />
    </div>
  );
};

export default TransactionLogs;