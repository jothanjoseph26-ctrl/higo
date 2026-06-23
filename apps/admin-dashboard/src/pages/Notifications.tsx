import React from 'react';
import BroadcastComposer from '../components/BroadcastComposer';
import DataTable from '../components/DataTable';
import { useCursorTable } from '../hooks/useCursorTable';
import { apiService } from '../services/api';
import { Notification } from '@higo/shared-types';
import { Mail, ShieldCheck } from 'lucide-react';
import { ColumnDef } from '@tanstack/react-table';

export const Notifications: React.FC = () => {
  const fetchNotifications = async (params: any) => {
    return apiService.getNotifications({
      limit: params.limit,
      cursor: params.cursor,
    });
  };

  const {
    data: notifications,
    loading,
    hasNextPage,
    hasPrevPage,
    handleNextPage,
    handlePrevPage,
  } = useCursorTable<Notification>({
    fetchFn: fetchNotifications,
  });

  const columns: ColumnDef<Notification>[] = [
    {
      accessorKey: 'title',
      header: 'Notification Title',
      cell: (info) => (
        <div className="flex flex-col font-medium">
          <span className="font-semibold text-darkNavy">{info.row.original.title}</span>
          <span className="text-[10px] text-gray-500">{info.row.original.body}</span>
        </div>
      ),
    },
    {
      accessorKey: 'userType',
      header: 'Target Audience',
      cell: (info) => (
        <span className="text-[10px] bg-lightGrey text-darkNavy px-2 py-0.5 rounded-button font-bold uppercase">
          {info.row.original.userType}
        </span>
      ),
    },
    {
      accessorKey: 'type',
      header: 'Category Type',
      cell: (info) => <span className="text-xs font-semibold capitalize">{info.row.original.type.replace('_', ' ')}</span>,
    },
    {
      accessorKey: 'sentAt',
      header: 'Dispatched Date',
      cell: (info) => (
        <span className="text-xs text-gray-500 font-medium">
          {info.row.original.sentAt ? new Date(info.row.original.sentAt).toLocaleString() : 'Pending'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-darkNavy">Broadcast Dispatcher</h1>
        <p className="text-xs text-gray-500">Draft push notification broadcasts and review past communications history</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Composer Form */}
        <div className="lg:col-span-2">
          <BroadcastComposer />
        </div>

        {/* Informative tips */}
        <div className="bg-white p-6 rounded-card shadow-custom border border-lightGrey space-y-4">
          <h3 className="font-semibold text-sm text-darkNavy border-b border-lightGrey pb-2 flex items-center gap-1.5">
            <Mail className="text-primaryGreen" size={16} />
            <span>Broadcast Tips</span>
          </h3>

          <div className="space-y-3 text-xs leading-relaxed text-dark font-medium">
            <p>
              <strong className="text-darkNavy">Segment Targeting:</strong> Dispatches can target all passengers, all registered drivers, online drivers, or users located within a specific zone.
            </p>
            <p>
              <strong className="text-darkNavy">FCM Delivery:</strong> Broadcasts are delivered via Firebase Cloud Messaging. Recipients will receive push notifications on their active device tokens.
            </p>
            <div className="p-3 bg-lightGrey rounded-input flex items-start gap-2 border-l-4 border-primaryGreen">
              <ShieldCheck className="text-primaryGreen flex-shrink-0 mt-0.5" size={14} />
              <p className="text-[10px] leading-tight text-gray-500">
                Ensure notifications are concise and formatted correctly. Avoid scheduling duplicate marketing updates to maintain good delivery engagement.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Dispatch History List */}
      <div className="space-y-3">
        <h3 className="font-semibold text-sm text-darkNavy">Dispatch Communication Logs</h3>
        <DataTable
          columns={columns}
          data={notifications}
          loading={loading}
          hasNextPage={hasNextPage}
          hasPrevPage={hasPrevPage}
          onNextPage={handleNextPage}
          onPrevPage={handlePrevPage}
        />
      </div>
    </div>
  );
};

export default Notifications;
