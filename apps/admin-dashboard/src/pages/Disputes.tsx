import React, { useState } from 'react';
import { useCursorTable } from '../hooks/useCursorTable';
import { apiService } from '../services/api';
import { Dispute, DisputeStatus } from '@higo/shared-types';
import DataTable from '../components/DataTable';
import DisputePanel from '../components/DisputePanel';
import { useUiStore } from '../stores/uiStore';
import { Check, X, ShieldAlert, Scale, HelpCircle } from 'lucide-react';
import { ColumnDef } from '@tanstack/react-table';

export const Disputes: React.FC = () => {
  const { addToast } = useUiStore();
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);

  const fetchDisputes = async (params: any) => {
    return apiService.getDisputes({
      limit: params.limit,
      cursor: params.cursor,
      status: params.status || undefined,
    });
  };

  const {
    data: disputes,
    loading,
    filters,
    updateFilters,
    hasNextPage,
    hasPrevPage,
    handleNextPage,
    handlePrevPage,
    refresh,
  } = useCursorTable<Dispute>({
    fetchFn: fetchDisputes,
    initialFilters: {
      status: '',
    },
  });

  const handleResolved = () => {
    addToast('Dispute resolved and saved', 'success');
    setSelectedDispute(null);
    refresh();
  };

  const renderStatusBadge = (status: DisputeStatus) => {
    switch (status) {
      case DisputeStatus.RESOLVED:
        return (
          <span className="bg-green-50 text-success border border-green-200 px-2.5 py-0.5 rounded-button text-[10px] font-semibold flex items-center gap-1 w-max">
            <Check size={10} /> Resolved
          </span>
        );
      case DisputeStatus.DISMISSED:
        return (
          <span className="bg-gray-100 text-gray-500 border border-gray-200 px-2.5 py-0.5 rounded-button text-[10px] font-semibold flex items-center gap-1 w-max">
            <X size={10} /> Dismissed
          </span>
        );
      case DisputeStatus.INVESTIGATING:
        return (
          <span className="bg-orange-50 text-accentOrange border border-orange-200 px-2.5 py-0.5 rounded-button text-[10px] font-semibold flex items-center gap-1 w-max animate-pulse">
            <ShieldAlert size={10} /> Investigating
          </span>
        );
      default:
        return (
          <span className="bg-red-50 text-error border border-red-200 px-2.5 py-0.5 rounded-button text-[10px] font-semibold flex items-center gap-1 w-max">
            <ShieldAlert size={10} /> Open
          </span>
        );
    }
  };

  const columns: ColumnDef<Dispute>[] = [
    {
      accessorKey: 'id',
      header: 'Dispute ID',
      cell: (info) => <span className="font-semibold text-xs text-darkNavy">{info.row.original.id.substring(0, 8)}...</span>,
    },
    {
      accessorKey: 'raisedBy',
      header: 'Raised By',
      cell: (info) => (
        <div className="flex flex-col text-xs font-semibold">
          <span className="capitalize text-darkNavy">{info.row.original.raisedBy}</span>
          <span className="text-[10px] text-gray-400 font-medium">Trip: {info.row.original.tripId.substring(0, 8)}...</span>
        </div>
      ),
    },
    {
      accessorKey: 'type',
      header: 'Issue Category',
      cell: (info) => <span className="text-xs font-medium text-dark">{info.row.original.type}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: (info) => renderStatusBadge(info.row.original.status),
    },
    {
      accessorKey: 'createdAt',
      header: 'Opened At',
      cell: (info) => <span className="text-xs text-gray-500 font-medium">{new Date(info.row.original.createdAt).toLocaleDateString()}</span>,
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: (info) => (
        <button
          onClick={() => setSelectedDispute(info.row.original)}
          className="px-3 py-1.5 bg-primaryGreen text-white text-xs font-semibold rounded-button hover:bg-opacity-90 transition-all shadow-sm"
        >
          View & Resolve
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-darkNavy">Dispute Center</h1>
        <p className="text-xs text-gray-500">Review ride complaints, check evidence files, and trigger refund payloads</p>
      </div>

      <div className="flex flex-col xl:flex-row gap-6 items-start">
        {/* Main List */}
        <div className="flex-1 w-full">
          <DataTable
            columns={columns}
            data={disputes}
            loading={loading}
            hasNextPage={hasNextPage}
            hasPrevPage={hasPrevPage}
            onNextPage={handleNextPage}
            onPrevPage={handlePrevPage}
            filtersNode={
              <select
                value={filters.status}
                onChange={(e) => updateFilters({ status: e.target.value })}
                className="px-3 py-1.5 text-xs border border-lightGrey rounded-input focus:outline-none"
              >
                <option value="">All Statuses</option>
                <option value="open">Open</option>
                <option value="investigating">Investigating</option>
                <option value="resolved">Resolved</option>
                <option value="dismissed">Dismissed</option>
              </select>
            }
          />
        </div>

        {/* Panel side view */}
        <div className="w-full xl:w-[450px] flex-shrink-0">
          {selectedDispute ? (
            <DisputePanel dispute={selectedDispute} onResolved={handleResolved} />
          ) : (
            <div className="bg-white p-8 rounded-card border border-lightGrey text-center text-gray-400 shadow-custom min-h-[300px] flex flex-col justify-center items-center">
              <Scale size={48} className="mb-2 opacity-30 text-accentOrange animate-pulse" />
              <h3 className="font-semibold text-sm text-darkNavy mb-1">Resolution Panel Empty</h3>
              <p className="text-xs max-w-xs leading-relaxed">
                Select a dispute record from the list to preview details, evidence logs, and process refunds.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Disputes;
