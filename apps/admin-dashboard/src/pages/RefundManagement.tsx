import React, { useState } from 'react';
import { useCursorTable } from '../hooks/useCursorTable';
import { apiService, RefundEligibleItem } from '../services/api';
import DataTable from '../components/DataTable';
import { useUiStore } from '../stores/uiStore';
import { ColumnDef } from '@tanstack/react-table';
import { Undo2, AlertCircle } from 'lucide-react';

const formatNGN = (kobo: number) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 2,
  }).format(kobo / 100);

export const RefundManagement: React.FC = () => {
  const { addToast } = useUiStore();
  const [processingRef, setProcessingRef] = useState<string | null>(null);

  const fetchEligible = async (params: Record<string, unknown>) => {
    return apiService.getRefundEligible({
      limit: params.limit as number,
      cursor: params.cursor as string | undefined,
    });
  };

  const {
    data: items,
    loading,
    hasNextPage,
    hasPrevPage,
    handleNextPage,
    handlePrevPage,
    refresh,
  } = useCursorTable<RefundEligibleItem>({
    fetchFn: fetchEligible,
    initialLimit: 15,
  });

  const handleRefund = async (item: RefundEligibleItem) => {
    const reason = window.prompt('Refund reason (optional):') ?? '';
    if (!window.confirm(`Issue full refund of ${formatNGN(item.totalFare)} for trip ${item.tripId.substring(0, 8)}...?`)) {
      return;
    }

    try {
      setProcessingRef(item.paystackReference);
      const result = await apiService.processRefund({
        reference: item.paystackReference,
        reason: reason || undefined,
      });
      addToast(`Refund processed — ref ${result.refundReference.substring(0, 12)}...`, 'success');
      refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Refund failed';
      addToast(message, 'error');
    } finally {
      setProcessingRef(null);
    }
  };

  const columns: ColumnDef<RefundEligibleItem>[] = [
    {
      accessorKey: 'tripId',
      header: 'Trip',
      cell: (info) => (
        <div className="flex flex-col text-xs">
          <span className="font-semibold text-darkNavy">{info.row.original.tripId.substring(0, 8)}...</span>
          <span className="text-gray-400 capitalize">{info.row.original.tripStatus}</span>
        </div>
      ),
    },
    {
      accessorKey: 'passengerName',
      header: 'Passenger',
      cell: (info) => (
        <div className="flex flex-col text-xs font-medium">
          <span>{info.row.original.passengerName || 'Anonymous'}</span>
          <span className="text-gray-400">{info.row.original.passengerPhone}</span>
        </div>
      ),
    },
    {
      accessorKey: 'paystackReference',
      header: 'Payment Ref',
      cell: (info) => (
        <span className="font-mono text-[10px] text-gray-600">
          {info.row.original.paystackReference.substring(0, 14)}...
        </span>
      ),
    },
    {
      accessorKey: 'totalFare',
      header: 'Fare',
      cell: (info) => (
        <span className="text-xs font-bold text-darkNavy">{formatNGN(info.row.original.totalFare)}</span>
      ),
    },
    {
      accessorKey: 'paymentStatus',
      header: 'Payment',
      cell: (info) => (
        <span className="text-xs font-semibold capitalize bg-lightGrey px-2 py-0.5 rounded-input">
          {info.row.original.paymentStatus}
        </span>
      ),
    },
    {
      accessorKey: 'completedAt',
      header: 'Completed',
      cell: (info) => (
        <span className="text-xs text-gray-500">
          {info.row.original.completedAt
            ? new Date(info.row.original.completedAt).toLocaleDateString()
            : '—'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: (info) => {
        const item = info.row.original;
        const busy = processingRef === item.paystackReference;
        return (
          <button
            onClick={() => handleRefund(item)}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-error text-white text-xs font-semibold rounded-button hover:bg-opacity-90 transition-all disabled:opacity-50"
          >
            <Undo2 size={12} />
            {busy ? 'Processing...' : 'Refund'}
          </button>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-darkNavy flex items-center gap-2">
          <Undo2 size={24} className="text-error" />
          Refund Management
        </h1>
        <p className="text-xs text-gray-500">
          Trips with held or released payments eligible for Paystack refund
        </p>
      </div>

      <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-card text-xs text-accentOrange">
        <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
        <span>
          Refunds are processed via Paystack and update trip payment status to <strong>refunded</strong>.
          Use test keys in staging.
        </span>
      </div>

      <DataTable
        columns={columns}
        data={items}
        loading={loading}
        hasNextPage={hasNextPage}
        hasPrevPage={hasPrevPage}
        onNextPage={handleNextPage}
        onPrevPage={handlePrevPage}
      />
    </div>
  );
};

export default RefundManagement;