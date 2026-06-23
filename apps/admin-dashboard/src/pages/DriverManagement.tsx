import React, { useState } from 'react';
import { useCursorTable } from '../hooks/useCursorTable';
import { apiService } from '../services/api';
import { Driver, KYCStatus, KycDocType, KycRejectionCode } from '@higo/shared-types';
import DataTable from '../components/DataTable';
import KycLightbox from '../components/KycLightbox';
import { useUiStore } from '../stores/uiStore';
import { Check, X, ShieldAlert, AlertTriangle, FileText, Ban, CheckCircle } from 'lucide-react';
import { ColumnDef } from '@tanstack/react-table';

export const DriverManagement: React.FC = () => {
  const { addToast } = useUiStore();
  
  // Custom fetch wrapper
  const fetchDrivers = async (params: any) => {
    return apiService.getDrivers({
      limit: params.limit,
      cursor: params.cursor,
      search: params.search,
      kycStatus: params.kycStatus || undefined,
      isOnline: params.isOnline !== undefined ? params.isOnline : undefined,
      isSuspended: params.isSuspended !== undefined ? params.isSuspended : undefined,
    });
  };

  const {
    data: drivers,
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
  } = useCursorTable<Driver>({
    fetchFn: fetchDrivers,
    initialFilters: {
      kycStatus: '',
      isOnline: undefined,
      isSuspended: undefined,
    },
  });

  // Modal / Lightbox states
  const [selectedKycDriver, setSelectedKycDriver] = useState<Driver | null>(null);
  const [suspendDriverId, setSuspendDriverId] = useState<string | null>(null);
  const [suspendReason, setSuspendReason] = useState('');

  // Form review submit handler
  const handleKycReviewSubmit = async (reviews: any[]) => {
    if (!selectedKycDriver) return;
    try {
      await apiService.reviewKyc(selectedKycDriver.id, { documents: reviews });
      addToast('Driver KYC document review submitted successfully', 'success');
      refresh();
    } catch (err: any) {
      addToast(err.message || 'Failed to review KYC documents', 'error');
    }
  };

  // Suspend action
  const handleSuspendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!suspendDriverId || !suspendReason.trim()) return;

    try {
      await apiService.suspendDriver(suspendDriverId, suspendReason);
      addToast('Driver has been suspended', 'warning');
      setSuspendDriverId(null);
      setSuspendReason('');
      refresh();
    } catch (err: any) {
      addToast(err.message || 'Failed to suspend driver', 'error');
    }
  };

  // Reinstate action
  const handleReinstate = async (driverId: string) => {
    if (!window.confirm('Are you sure you want to reinstate this driver?')) return;
    try {
      await apiService.reinstateDriver(driverId);
      addToast('Driver reinstated successfully', 'success');
      refresh();
    } catch (err: any) {
      addToast(err.message || 'Failed to reinstate driver', 'error');
    }
  };

  // Map kyc status badges
  const renderKycBadge = (status: KYCStatus) => {
    switch (status) {
      case KYCStatus.APPROVED:
        return (
          <span className="bg-green-50 text-success border border-green-200 px-2 py-0.5 rounded-button text-[10px] font-semibold flex items-center gap-1 w-max">
            <Check size={10} /> Approved
          </span>
        );
      case KYCStatus.REJECTED:
        return (
          <span className="bg-red-50 text-error border border-red-200 px-2 py-0.5 rounded-button text-[10px] font-semibold flex items-center gap-1 w-max">
            <X size={10} /> Rejected
          </span>
        );
      case KYCStatus.UNDER_REVIEW:
        return (
          <span className="bg-orange-50 text-accentOrange border border-orange-200 px-2 py-0.5 rounded-button text-[10px] font-semibold flex items-center gap-1 w-max animate-pulse">
            <AlertTriangle size={10} /> Under Review
          </span>
        );
      default:
        return (
          <span className="bg-gray-100 text-gray-500 border border-gray-200 px-2 py-0.5 rounded-button text-[10px] font-semibold flex items-center gap-1 w-max">
            <FileText size={10} /> Pending Upload
          </span>
        );
    }
  };

  // Map raw documents to Lightbox format
  const getDriverDocsForLightbox = (driver: Driver) => {
    const docs = driver.kycDocuments || {};
    const defaultTypes = [
      KycDocType.NIN,
      KycDocType.DRIVERS_LICENCE,
      KycDocType.VEHICLE_REG,
      KycDocType.ROAD_WORTHINESS,
      KycDocType.INSURANCE,
    ];

    return defaultTypes.map((type) => {
      const doc = docs[type];
      return {
        docType: type,
        s3Key: doc?.s3Key,
        url: doc?.s3Key ? `https://higo-kyc-docs.s3.amazonaws.com/${doc.s3Key}` : undefined, // fallback url
        status: doc?.status || ('not_uploaded' as any),
        rejectionCode: doc?.rejectionCode,
        rejectionReason: doc?.rejectionReason,
        uploadedAt: doc?.uploadedAt,
      };
    });
  };

  // Table Columns config
  const columns: ColumnDef<Driver>[] = [
    {
      accessorKey: 'name',
      header: 'Driver Name',
      cell: (info) => (
        <div className="flex flex-col">
          <span className="font-semibold text-darkNavy">{info.row.original.name}</span>
          <span className="text-[10px] text-gray-500 capitalize">{info.row.original.vehicleType} · {info.row.original.vehiclePlate}</span>
        </div>
      ),
    },
    {
      accessorKey: 'phone',
      header: 'Contact Details',
      cell: (info) => (
        <div className="flex flex-col text-xs">
          <span>{info.row.original.phone}</span>
          <span className="text-[10px] text-gray-500">{info.row.original.email || 'No email'}</span>
        </div>
      ),
    },
    {
      accessorKey: 'kycStatus',
      header: 'KYC Status',
      cell: (info) => renderKycBadge(info.row.original.kycStatus),
    },
    {
      accessorKey: 'verificationTier',
      header: 'Verification Tier',
      cell: (info) => (
        <span className="text-xs uppercase font-bold text-darkNavy bg-lightGrey px-2.5 py-1 rounded-input">
          {info.row.original.verificationTier}
        </span>
      ),
    },
    {
      accessorKey: 'isOnline',
      header: 'Activity Status',
      cell: (info) => (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <span className={`w-2 h-2 rounded-full ${info.row.original.isOnline ? 'bg-success' : 'bg-gray-400'}`} />
            <span>{info.row.original.isOnline ? 'Online' : 'Offline'}</span>
          </div>
          {info.row.original.isSuspended && (
            <span className="text-[9px] bg-red-100 text-error px-1.5 py-0.5 rounded-button font-bold w-max uppercase">
              Suspended
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: (info) => {
        const driver = info.row.original;
        return (
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedKycDriver(driver)}
              className="px-3 py-1.5 bg-primaryGreen text-white text-xs font-semibold rounded-button hover:bg-opacity-90 transition-all shadow-sm"
            >
              Verify KYC
            </button>
            {driver.isSuspended ? (
              <button
                onClick={() => handleReinstate(driver.id)}
                className="px-3 py-1.5 bg-white border border-success text-success text-xs font-semibold rounded-button hover:bg-green-50 transition-all"
              >
                Reinstate
              </button>
            ) : (
              <button
                onClick={() => setSuspendDriverId(driver.id)}
                className="px-3 py-1.5 bg-white border border-error text-error text-xs font-semibold rounded-button hover:bg-red-50 transition-all flex items-center gap-1"
              >
                <Ban size={12} />
                <span>Suspend</span>
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-darkNavy">Driver Management</h1>
        <p className="text-xs text-gray-500">Track driver activity, verification tiers, and review KYC checklists</p>
      </div>

      <DataTable
        columns={columns}
        data={drivers}
        loading={loading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, phone, plate number..."
        hasNextPage={hasNextPage}
        hasPrevPage={hasPrevPage}
        onNextPage={handleNextPage}
        onPrevPage={handlePrevPage}
        filtersNode={
          <div className="flex gap-2">
            <select
              value={filters.kycStatus}
              onChange={(e) => updateFilters({ kycStatus: e.target.value })}
              className="px-3 py-1.5 text-xs border border-lightGrey rounded-input focus:outline-none"
            >
              <option value="">All KYC Status</option>
              <option value="pending">Pending upload</option>
              <option value="under_review">Under review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>

            <select
              value={filters.isOnline === undefined ? '' : String(filters.isOnline)}
              onChange={(e) =>
                updateFilters({
                  isOnline: e.target.value === '' ? undefined : e.target.value === 'true',
                })
              }
              className="px-3 py-1.5 text-xs border border-lightGrey rounded-input focus:outline-none"
            >
              <option value="">All Presence</option>
              <option value="true">Online</option>
              <option value="false">Offline</option>
            </select>

            <select
              value={filters.isSuspended === undefined ? '' : String(filters.isSuspended)}
              onChange={(e) =>
                updateFilters({
                  isSuspended: e.target.value === '' ? undefined : e.target.value === 'true',
                })
              }
              className="px-3 py-1.5 text-xs border border-lightGrey rounded-input focus:outline-none"
            >
              <option value="">All Statuses</option>
              <option value="true">Suspended Only</option>
              <option value="false">Active Only</option>
            </select>
          </div>
        }
      />

      {/* KYC Review Lightbox Modal */}
      {selectedKycDriver && (
        <KycLightbox
          isOpen={true}
          onClose={() => setSelectedKycDriver(null)}
          driverName={selectedKycDriver.name}
          driverId={selectedKycDriver.id}
          documents={getDriverDocsForLightbox(selectedKycDriver)}
          onSubmitReview={handleKycReviewSubmit}
        />
      )}

      {/* Suspend Driver Reason Dialog */}
      {suspendDriverId && (
        <div className="fixed inset-0 bg-darkNavy bg-opacity-50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSuspendSubmit} className="bg-white p-6 rounded-card shadow-custom w-full max-w-md border border-lightGrey">
            <h3 className="font-semibold text-lg text-darkNavy mb-2 flex items-center gap-2">
              <ShieldAlert className="text-error" size={22} />
              <span>Suspend Driver Account</span>
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Suspending this account will block the driver from logging in or receiving trip request dispatches.
            </p>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-darkNavy mb-1">Reason for Suspension</label>
              <textarea
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder="Detail the policy violation (e.g., recurrent safety cancellations, passenger abuse, document fraud)..."
                rows={4}
                className="w-full px-3 py-2 border border-lightGrey rounded-input text-xs resize-none focus:outline-none focus:border-primaryGreen"
                required
              />
            </div>

            <div className="flex justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setSuspendDriverId(null)}
                className="px-4 py-2 border border-lightGrey rounded-button hover:bg-lightGrey font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2 bg-error text-white rounded-button font-semibold hover:bg-opacity-90"
              >
                Confirm Suspension
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default DriverManagement;
