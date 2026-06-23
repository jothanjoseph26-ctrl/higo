import React from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  ColumnDef,
} from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, Search, Loader2 } from 'lucide-react';

interface DataTableProps<T> {
  columns: ColumnDef<T, any>[];
  data: T[];
  loading?: boolean;
  hasNextPage?: boolean;
  hasPrevPage?: boolean;
  onNextPage?: () => void;
  onPrevPage?: () => void;
  search?: string;
  onSearchChange?: (val: string) => void;
  searchPlaceholder?: string;
  filtersNode?: React.ReactNode;
}

export function DataTable<T>({
  columns,
  data,
  loading = false,
  hasNextPage = false,
  hasPrevPage = false,
  onNextPage,
  onPrevPage,
  search,
  onSearchChange,
  searchPlaceholder = 'Search...',
  filtersNode,
}: DataTableProps<T>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="flex flex-col w-full bg-white rounded-card shadow-custom overflow-hidden">
      {(onSearchChange !== undefined || filtersNode) && (
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 border-b border-lightGrey bg-white">
          {onSearchChange !== undefined && (
            <div className="relative min-w-[280px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-10 pr-4 py-2 border border-lightGrey rounded-input text-sm focus:outline-none focus:border-primaryGreen focus:ring-1 focus:ring-primaryGreen"
              />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 ml-auto">{filtersNode}</div>
        </div>
      )}

      <div className="overflow-x-auto relative min-h-[200px]">
        {loading && (
          <div className="absolute inset-0 bg-white bg-opacity-70 flex items-center justify-center z-10">
            <Loader2 className="animate-spin text-primaryGreen" size={32} />
          </div>
        )}

        <table className="w-full text-left border-collapse">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="bg-lightGrey">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-6 py-4 text-xs font-semibold text-darkNavy tracking-wider uppercase border-b border-lightGrey"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-lightGrey hover:bg-lightGrey hover:bg-opacity-50 transition-colors"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-6 py-4 text-sm text-dark font-medium">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-6 py-12 text-center text-sm text-gray-500 font-medium"
                >
                  No results found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(onNextPage || onPrevPage) && (
        <div className="flex items-center justify-between p-4 bg-white border-t border-lightGrey">
          <span className="text-xs text-gray-500 font-medium">
            Page controls
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onPrevPage}
              disabled={!hasPrevPage}
              className={`p-2 border border-lightGrey rounded-input hover:bg-lightGrey transition-all ${
                !hasPrevPage ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={onNextPage}
              disabled={!hasNextPage}
              className={`p-2 border border-lightGrey rounded-input hover:bg-lightGrey transition-all ${
                !hasNextPage ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default DataTable;
