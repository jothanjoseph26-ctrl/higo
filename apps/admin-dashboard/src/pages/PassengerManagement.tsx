import React from 'react';
import { useCursorTable } from '../hooks/useCursorTable';
import { apiService } from '../services/api';
import { User } from '@higo/shared-types';
import DataTable from '../components/DataTable';
import { useUiStore } from '../stores/uiStore';
import { ShieldAlert, ShieldCheck, Check, Ban } from 'lucide-react';
import { ColumnDef } from '@tanstack/react-table';

export const PassengerManagement: React.FC = () => {
  const { addToast } = useUiStore();

  const fetchPassengers = async (params: any) => {
    return apiService.getPassengers({
      limit: params.limit,
      cursor: params.cursor,
      search: params.search,
      isBlocked: params.isBlocked !== undefined ? params.isBlocked : undefined,
    });
  };

  const {
    data: passengers,
    loading,
    search,
    setSearch,
    filters,
    updateFilters,
    hasNextPage,
    hasPrevPage,
    handleNextPage,
    handlePrevPage,
    refresh,
  } = useCursorTable<User>({
    fetchFn: fetchPassengers,
    initialFilters: {
      isBlocked: undefined,
    },
  });

  const handleToggleBlock = async (passengerId: string, currentlyBlocked: boolean) => {
    const action = currentlyBlocked ? 'unblock' : 'block';
    if (!window.confirm(`Are you sure you want to ${action} this passenger?`)) return;

    try {
      if (currentlyBlocked) {
        await apiService.unblockPassenger(passengerId);
      } else {
        await apiService.blockPassenger(passengerId);
      }
      addToast(`Passenger successfully ${currentlyBlocked ? 'unblocked' : 'blocked'}`, 'success');
      refresh();
    } catch (err: any) {
      addToast(err?.message || `Failed to ${action} passenger`, 'error');
    }
  };

  const columns: ColumnDef<User>[] = [
    {
      accessorKey: 'name',
      header: 'Passenger Name',
      cell: (info) => (
        <div className="flex flex-col font-medium">
          <span className="font-semibold text-darkNavy">{info.row.original.name || 'Anonymous User'}</span>
          <span className="text-[10px] text-gray-500">{info.row.original.id}</span>
        </div>
      ),
    },
    {
      accessorKey: 'phone',
      header: 'Contact Details',
      cell: (info) => (
        <div className="flex flex-col text-xs font-semibold">
          <span>{info.row.original.phone}</span>
          <span className="text-[10px] text-gray-500 font-medium">{info.row.original.email || 'No email'}</span>
        </div>
      ),
    },
    {
      accessorKey: 'ratingAvg',
      header: 'Rating (Avg)',
      cell: (info) => (
        <span className="text-xs font-bold text-darkNavy bg-lightGrey px-2.5 py-1 rounded-input">
          ⭐ {info.row.original.ratingAvg ? info.row.original.ratingAvg.toFixed(1) : '5.0'}
        </span>
      ),
    },
    {
      accessorKey: 'totalTrips',
      header: 'Total Rides',
      cell: (info) => <span className="font-semibold">{info.row.original.totalTrips || 0}</span>,
    },
    {
      accessorKey: 'isBlocked',
      header: 'Account Status',
      cell: (info) => (
        <span
          className={`px-2 py-0.5 rounded-button text-[10px] font-semibold flex items-center gap-1 w-max ${
            info.row.original.isBlocked
              ? 'bg-red-50 text-error border border-red-200'
              : 'bg-green-50 text-success border border-green-200'
          }`}
        >
          {info.row.original.isBlocked ? <ShieldAlert size={10} /> : <ShieldCheck size={10} />}
          {info.row.original.isBlocked ? 'Blocked' : 'Active'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: (info) => {
        const passenger = info.row.original;
        return (
          <button
            onClick={() => handleToggleBlock(passenger.id, passenger.isBlocked)}
            className={`px-3 py-1.5 rounded-button text-xs font-semibold transition-all flex items-center gap-1 border ${
              passenger.isBlocked
                ? 'bg-white border-success text-success hover:bg-green-50'
                : 'bg-white border-error text-error hover:bg-red-50'
            }`}
          >
            {passenger.isBlocked ? <ShieldCheck size={12} /> : <Ban size={12} />}
            <span>{passenger.isBlocked ? 'Unblock Account' : 'Block Account'}</span>
          </button>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-darkNavy">Passenger Management</h1>
        <p className="text-xs text-gray-500">Track passenger rides, ratings, and configure account access holds</p>
      </div>

      <DataTable
        columns={columns}
        data={passengers}
        loading={loading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, phone number, email..."
        hasNextPage={hasNextPage}
        hasPrevPage={hasPrevPage}
        onNextPage={handleNextPage}
        onPrevPage={handlePrevPage}
        filtersNode={
          <select
            value={filters.isBlocked === undefined ? '' : String(filters.isBlocked)}
            onChange={(e) =>
              updateFilters({
                isBlocked: e.target.value === '' ? undefined : e.target.value === 'true',
              })
            }
            className="px-3 py-1.5 text-xs border border-lightGrey rounded-input focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="false">Active Only</option>
            <option value="true">Blocked Only</option>
          </select>
        }
      />
    </div>
  );
};

export default PassengerManagement;
