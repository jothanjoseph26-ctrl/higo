import React, { useState } from 'react';
import { Dispute, DisputeStatus } from '@higo/shared-types';
import { usePermissions } from '../hooks/usePermissions';
import { apiService } from '../services/api';
import { AlertCircle, CheckCircle2, Scale, ExternalLink } from 'lucide-react';

interface DisputePanelProps {
  dispute: Dispute;
  onResolved: () => void;
}

export const DisputePanel: React.FC<DisputePanelProps> = ({ dispute, onResolved }) => {
  const { canResolveDisputes } = usePermissions();
  const [status, setStatus] = useState<DisputeStatus>(DisputeStatus.RESOLVED);
  const [resolution, setResolution] = useState('');
  const [refundAmountNGN, setRefundAmountNGN] = useState('0');
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canResolveDisputes) {
      alert('You do not have permission to resolve disputes.');
      return;
    }

    if (!resolution.trim()) {
      setErrorMsg('Resolution notes are required.');
      return;
    }

    const refundVal = parseFloat(refundAmountNGN);
    if (isNaN(refundVal) || refundVal < 0) {
      setErrorMsg('Refund amount must be a positive number.');
      return;
    }

    try {
      setLoading(true);
      setErrorMsg('');
      setSuccessMsg('');

      const payload = {
        status,
        resolution,
        refundAmount: refundVal > 0 ? Math.round(refundVal * 100) : undefined, // Convert NGN to Kobo
      };

      await apiService.resolveDispute(dispute.id, payload);
      setSuccessMsg('Dispute resolved successfully!');
      onResolved();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to resolve dispute.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-card shadow-custom w-full">
      <div className="flex items-center gap-2 mb-6 border-b border-lightGrey pb-4">
        <Scale className="text-accentOrange" size={24} />
        <div>
          <h3 className="text-base font-semibold text-darkNavy">Dispute Resolution Panel</h3>
          <p className="text-xs text-gray-500">ID: {dispute.id}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div>
          <h4 className="text-xs font-semibold text-darkNavy mb-2 uppercase tracking-wider">
            Dispute Information
          </h4>
          <div className="space-y-2 text-sm text-dark bg-lightGrey p-4 rounded-input">
            <p>
              <strong className="text-darkNavy">Raised By:</strong>{' '}
              <span className="capitalize">{dispute.raisedBy}</span>
            </p>
            <p>
              <strong className="text-darkNavy">Type:</strong> {dispute.type}
            </p>
            <p>
              <strong className="text-darkNavy">Trip ID:</strong> {dispute.tripId}
            </p>
            <p>
              <strong className="text-darkNavy">Description:</strong> {dispute.description}
            </p>
            <p>
              <strong className="text-darkNavy">Created:</strong>{' '}
              {new Date(dispute.createdAt).toLocaleString()}
            </p>
          </div>
        </div>

        <div>
          <h4 className="text-xs font-semibold text-darkNavy mb-2 uppercase tracking-wider">
            Evidence Files
          </h4>
          <div className="space-y-2 bg-lightGrey p-4 rounded-input min-h-[140px] flex flex-col justify-center">
            {dispute.evidenceUrls && dispute.evidenceUrls.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {dispute.evidenceUrls.map((url, index) => (
                  <a
                    key={index}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between p-2 bg-white rounded-input text-xs font-semibold text-primaryGreen hover:underline border border-lightGrey"
                  >
                    <span>Evidence #{index + 1}</span>
                    <ExternalLink size={12} />
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500 text-center">No evidence files provided.</p>
            )}
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="mb-4 p-3 bg-red-50 border-l-4 border-error text-error text-sm rounded-r-md flex items-center gap-2">
          <AlertCircle size={16} />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="mb-4 p-3 bg-green-50 border-l-4 border-success text-success text-sm rounded-r-md flex items-center gap-2">
          <CheckCircle2 size={16} />
          <span>{successMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 border-t border-lightGrey pt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-darkNavy mb-1">Resolution Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as DisputeStatus)}
              className="w-full px-3 py-2 border border-lightGrey rounded-input text-sm focus:outline-none focus:border-primaryGreen"
            >
              <option value={DisputeStatus.RESOLVED}>Resolve (approve refund / action)</option>
              <option value={DisputeStatus.DISMISSED}>Dismiss (reject dispute claim)</option>
              <option value={DisputeStatus.INVESTIGATING}>Investigating</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-darkNavy mb-1">
              Optional Refund Amount (₦)
            </label>
            <input
              type="number"
              step="0.01"
              value={refundAmountNGN}
              onChange={(e) => setRefundAmountNGN(e.target.value)}
              className="w-full px-3 py-2 border border-lightGrey rounded-input text-sm focus:outline-none focus:border-primaryGreen"
              placeholder="e.g. 1500"
            />
            <span className="text-[10px] text-gray-500">
              Equivalent: {Math.round((parseFloat(refundAmountNGN) || 0) * 100)} kobo
            </span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-darkNavy mb-1">Resolution Notes</label>
          <textarea
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-lightGrey rounded-input text-sm focus:outline-none focus:border-primaryGreen"
            placeholder="Document detailed findings, communication logs, and payout adjustments..."
            required
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="submit"
            disabled={loading || !canResolveDisputes}
            className={`px-6 py-2.5 bg-primaryGreen text-white font-semibold rounded-button text-sm transition-all hover:bg-opacity-95 shadow-sm ${
              loading || !canResolveDisputes ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {loading ? 'Submitting...' : 'Submit Resolution'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default DisputePanel;
