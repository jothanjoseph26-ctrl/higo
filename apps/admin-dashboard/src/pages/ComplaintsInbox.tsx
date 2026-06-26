import React, { useState } from 'react';
import { useCursorTable } from '../hooks/useCursorTable';
import { apiService } from '../services/api';
import { Dispute, DisputeStatus } from '@higo/shared-types';
import DataTable from '../components/DataTable';
import DisputePanel from '../components/DisputePanel';
import { useUiStore } from '../stores/uiStore';
import { ColumnDef } from '@tanstack/react-table';
import { Inbox, ShieldAlert, Check, X } from 'lucide-react';

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
        <span className="bg-orange-50 text-accentOrange border border-orange-200 px-2.5 py-0.5 rounded-button text-[10px] font-semibold flex items-center gap-1 w-max">
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

export const ComplaintsInbox: React.FC = () => {
  const { addToast } = useUiStore();
  const [selectedComplaint, setSelectedComplaint] = useState<Dispute | null>(null);

  const fetchComplaints = async (params: Record<string, unknown>) => {
    return apiService.getComplaints({
      limit: params.limit as number,
      cursor: params.cursor as string | undefined,
      status: (params.status as string) || undefined,
    });
  };

  const {
    data: complaints,
    loading,
    filters,
    updateFilters,
    hasNextPage,
    hasPrevPage,
    handleNextPage,
    handlePrevPage,
    refresh,
  } = useCursorTable<Dispute>({
    fetchFn: fetchComplaints,
    initialFilters: { status: 'open' },
  });

  const handleResolved = () => {
    addToast('Complaint updated', 'success');
    setSelectedComplaint(null);
    refresh();
  };

  const columns: ColumnDef<Dispute>[] = [
    {
      accessorKey: 'id',
      header: 'Ticket',
      cell: (info) => (
        <span className="font-semibold text-xs text-darkNavy">{info.row.original.id.substring(0, 8)}...</span>
      ),
    },
    {
      accessorKey: 'type',
      header: 'Category',
      cell: (info) => <span className="text-xs font-medium capitalize">{info.row.original.type}</span>,
    },
    {
      accessorKey: 'description',
      header: 'Summary',
      cell: (info) => (
        <span className="text-xs text-gray-600 line-clamp-2 max-w-xs">
          {info.row.original.description}
        </span>
      ),
    },
    {
      accessorKey: 'tripId',
      header: 'Trip',
      cell: (info) => (
        <span className="text-[10px] text-gray-400 font-mono">
          {info.row.original.tripId.substring(0, 8)}...
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: (info) => renderStatusBadge(info.row.original.status),
    },
    {
      accessorKey: 'createdAt',
      header: 'Opened',
      cell: (info) => (
        <span className="text-xs text-gray-500">
          {new Date(info.row.original.createdAt).toLocaleString()}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: (info) => (
        <button
          onClick={() => setSelectedComplaint(info.row.original)}
          className="px-3 py-1.5 bg-primaryGreen text-white text-xs font-semibold rounded-button hover:bg-opacity-90 transition-all"
        >
          Review
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-darkNavy flex items-center gap-2">
          <Inbox size={24} className="text-accentOrange" />
          Complaints Inbox
        </h1>
        <p className="text-xs text-gray-500">
          Passenger-reported issues requiring support follow-up
        </p>
      </div>

      <div className="flex flex-col xl:flex-row gap-6 items-start">
        <div className="flex-1 w-full">
          <DataTable
            columns={columns}
            data={complaints}
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
                <option value="open">Open</option>
                <option value="investigating">Investigating</option>
                <option value="">All Active</option>
                <option value="resolved">Resolved</option>
                <option value="dismissed">Dismissed</option>
              </select>
            }
          />
        </div>

        <div className="w-full xl:w-[450px] flex-shrink-0">
          {selectedComplaint ? (
            <DisputePanel dispute={selectedComplaint} onResolved={handleResolved} />
          ) : (
            <div className="bg-white p-8 rounded-card border border-lightGrey text-center text-gray-400 shadow-custom min-h-[300px] flex flex-col justify-center items-center">
              <Inbox size={48} className="mb-2 opacity-30 text-accentOrange" />
              <h3 className="font-semibold text-sm text-darkNavy mb-1">No Ticket Selected</h3>
              <p className="text-xs max-w-xs leading-relaxed">
                Select an open passenger complaint to review details and take action.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ComplaintsInbox;