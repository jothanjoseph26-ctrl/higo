import React from 'react';
import Papa from 'papaparse';
import { Download } from 'lucide-react';
import { usePermissions } from '../hooks/usePermissions';

interface ExportButtonProps {
  data: any[];
  filename?: string;
  disabled?: boolean;
}

export const ExportButton: React.FC<ExportButtonProps> = ({
  data,
  filename = 'export.csv',
  disabled = false,
}) => {
  const { canExportFinancials } = usePermissions();

  const handleExport = () => {
    if (!canExportFinancials) {
      alert('You do not have permission to export this data.');
      return;
    }

    if (!data || data.length === 0) {
      alert('No data available to export.');
      return;
    }

    try {
      const formattedData = data.map((row) => {
        const newRow = { ...row };
        Object.keys(newRow).forEach((key) => {
          const lowerKey = key.toLowerCase();
          if (
            typeof newRow[key] === 'number' &&
            (lowerKey.includes('fare') ||
              lowerKey.includes('amount') ||
              lowerKey.includes('earning') ||
              lowerKey.includes('revenue') ||
              lowerKey.includes('fee') ||
              lowerKey.includes('payout') ||
              lowerKey.includes('gross') ||
              lowerKey.includes('net') ||
              lowerKey.includes('refund'))
          ) {
            newRow[`${key}_NGN`] = newRow[key] / 100;
          }
        });
        return newRow;
      });

      const csv = Papa.unparse(formattedData);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('CSV export failed:', error);
      alert('Failed to export CSV.');
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={disabled || !canExportFinancials}
      className={`flex items-center gap-2 px-4 py-2 bg-primaryGreen text-white rounded-button font-medium text-sm transition-all hover:bg-opacity-90 shadow-sm ${
        disabled || !canExportFinancials ? 'opacity-50 cursor-not-allowed' : ''
      }`}
    >
      <Download size={16} />
      <span>Export CSV</span>
    </button>
  );
};
export default ExportButton;
