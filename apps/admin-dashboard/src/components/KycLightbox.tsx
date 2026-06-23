import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Check, AlertTriangle, FileText } from 'lucide-react';
import { KycDocType, KycRejectionCode } from '@higo/shared-types';

interface KycDocumentDetail {
  docType: KycDocType;
  s3Key?: string;
  url?: string;
  status: 'pending' | 'under_review' | 'approved' | 'rejected' | 'not_uploaded';
  rejectionCode?: KycRejectionCode;
  rejectionReason?: string;
  uploadedAt?: string | null;
}

interface KycLightboxProps {
  isOpen: boolean;
  onClose: () => void;
  driverName: string;
  driverId: string;
  documents: KycDocumentDetail[];
  onSubmitReview: (reviews: Array<{
    docType: KycDocType;
    decision: 'approve' | 'reject';
    rejectionCode?: KycRejectionCode;
    rejectionReason?: string;
  }>) => Promise<void>;
}

const DOC_TYPE_LABELS: Record<KycDocType, string> = {
  [KycDocType.NIN]: 'NIN (National Identity Number)',
  [KycDocType.DRIVERS_LICENCE]: "Driver's Licence",
  [KycDocType.VEHICLE_REG]: 'Vehicle Registration',
  [KycDocType.ROAD_WORTHINESS]: 'Road Worthiness Certificate',
  [KycDocType.INSURANCE]: 'Insurance Policy',
};

const REJECTION_CODES = [
  { code: KycRejectionCode.DOC_BLURRY, label: 'Document is blurry or illegible' },
  { code: KycRejectionCode.DOC_EXPIRED, label: 'Document has expired' },
  { code: KycRejectionCode.DOC_MISMATCH, label: 'Name or details mismatch driver profile' },
  { code: KycRejectionCode.DOC_FRAUDULENT, label: 'Document appears altered or fraudulent' },
  { code: KycRejectionCode.DOC_INCOMPLETE, label: 'Document is incomplete or cut off' },
];

export const KycLightbox: React.FC<KycLightboxProps> = ({
  isOpen,
  onClose,
  driverName,
  driverId,
  documents,
  onSubmitReview,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [decisions, setDecisions] = useState<Record<KycDocType, {
    decision: 'approve' | 'reject' | null;
    rejectionCode?: KycRejectionCode;
    rejectionReason?: string;
  }>>({
    [KycDocType.NIN]: { decision: null },
    [KycDocType.DRIVERS_LICENCE]: { decision: null },
    [KycDocType.VEHICLE_REG]: { decision: null },
    [KycDocType.ROAD_WORTHINESS]: { decision: null },
    [KycDocType.INSURANCE]: { decision: null },
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const initialDecisions: any = {};
    documents.forEach((doc) => {
      initialDecisions[doc.docType] = {
        decision: doc.status === 'approved' ? 'approve' : doc.status === 'rejected' ? 'reject' : null,
        rejectionCode: doc.rejectionCode,
        rejectionReason: doc.rejectionReason,
      };
    });
    setDecisions(initialDecisions);
    setCurrentIndex(0);
  }, [documents, isOpen]);

  if (!isOpen) return null;

  const currentDoc = documents[currentIndex];
  if (!currentDoc) return null;

  const currentDecision = decisions[currentDoc.docType];

  const handleApprove = () => {
    setDecisions((prev) => ({
      ...prev,
      [currentDoc.docType]: { decision: 'approve' },
    }));
  };

  const handleReject = () => {
    setDecisions((prev) => ({
      ...prev,
      [currentDoc.docType]: {
        decision: 'reject',
        rejectionCode: prev[currentDoc.docType]?.rejectionCode || KycRejectionCode.DOC_BLURRY,
        rejectionReason: prev[currentDoc.docType]?.rejectionReason || '',
      },
    }));
  };

  const handleRejectionCodeChange = (code: KycRejectionCode) => {
    setDecisions((prev) => ({
      ...prev,
      [currentDoc.docType]: {
        ...prev[currentDoc.docType],
        rejectionCode: code,
      },
    }));
  };

  const handleRejectionReasonChange = (reason: string) => {
    setDecisions((prev) => ({
      ...prev,
      [currentDoc.docType]: {
        ...prev[currentDoc.docType],
        rejectionReason: reason,
      },
    }));
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : documents.length - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev < documents.length - 1 ? prev + 1 : 0));
  };

  const handleSubmit = async () => {
    const payload = Object.entries(decisions)
      .filter(([_, value]) => value.decision !== null)
      .map(([docType, value]) => ({
        docType: docType as KycDocType,
        decision: value.decision as 'approve' | 'reject',
        rejectionCode: value.rejectionCode,
        rejectionReason: value.rejectionReason,
      }));

    if (payload.length === 0) {
      alert('Please make at least one decision before submitting.');
      return;
    }

    try {
      setSubmitting(true);
      await onSubmitReview(payload);
      onClose();
    } catch (err: any) {
      alert(err.message || 'Failed to submit KYC review.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-darkNavy bg-opacity-75 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white w-full max-w-5xl rounded-card shadow-custom flex flex-col max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-lightGrey">
          <div>
            <h3 className="font-semibold text-lg text-darkNavy">KYC Document Review</h3>
            <p className="text-xs text-gray-500">Driver: {driverName} ({driverId})</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-lightGrey rounded-full transition-all">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          <div className="flex-1 bg-darkNavy flex flex-col items-center justify-center p-6 relative group border-r border-lightGrey min-h-[300px]">
            {currentDoc.status === 'not_uploaded' ? (
              <div className="text-center text-gray-400">
                <FileText size={64} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">Document not uploaded yet</p>
              </div>
            ) : currentDoc.url ? (
              <img
                src={currentDoc.url}
                alt={DOC_TYPE_LABELS[currentDoc.docType]}
                className="max-w-full max-h-[50vh] object-contain rounded-md"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                  const fallback = document.getElementById('image-fallback');
                  if (fallback) fallback.style.display = 'block';
                }}
              />
            ) : (
              <div className="text-center text-gray-400">
                <FileText size={64} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">Document URL missing or invalid</p>
              </div>
            )}
            <div id="image-fallback" style={{ display: 'none' }} className="text-center text-gray-400">
              <FileText size={64} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">Document format not viewable directly (PDF/Other)</p>
              {currentDoc.url && (
                <a
                  href={currentDoc.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-block text-xs bg-primaryGreen text-white px-3 py-1.5 rounded-button"
                >
                  Download File to View
                </a>
              )}
            </div>

            <button
              onClick={handlePrev}
              className="absolute left-4 top-1/2 -translate-y-1/2 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-70 transition-all"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              onClick={handleNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-70 transition-all"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          <div className="w-full md:w-96 flex flex-col overflow-y-auto p-6 bg-white">
            <h4 className="font-semibold text-sm text-darkNavy mb-3">Documents Checklist</h4>
            <div className="space-y-2 mb-6">
              {documents.map((doc, idx) => {
                const dec = decisions[doc.docType]?.decision;
                return (
                  <button
                    key={doc.docType}
                    onClick={() => setCurrentIndex(idx)}
                    className={`w-full flex items-center justify-between p-3 rounded-input border transition-all text-left ${
                      idx === currentIndex
                        ? 'border-primaryGreen bg-primaryGreen bg-opacity-5'
                        : 'border-lightGrey hover:bg-lightGrey hover:bg-opacity-50'
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-darkNavy">{DOC_TYPE_LABELS[doc.docType]}</span>
                      <span className="text-[10px] text-gray-500 capitalize">
                        Original: {doc.status.replace('_', ' ')}
                      </span>
                    </div>
                    {dec === 'approve' && (
                      <span className="bg-success bg-opacity-10 text-success text-[10px] font-semibold px-2 py-0.5 rounded-button flex items-center gap-1">
                        <Check size={10} /> Approved
                      </span>
                    )}
                    {dec === 'reject' && (
                      <span className="bg-error bg-opacity-10 text-error text-[10px] font-semibold px-2 py-0.5 rounded-button flex items-center gap-1">
                        <AlertTriangle size={10} /> Rejected
                      </span>
                    )}
                    {!dec && doc.status === 'not_uploaded' && (
                      <span className="bg-gray-100 text-gray-400 text-[10px] font-semibold px-2 py-0.5 rounded-button">
                        Empty
                      </span>
                    )}
                    {!dec && doc.status !== 'not_uploaded' && (
                      <span className="bg-warning bg-opacity-10 text-warning text-[10px] font-semibold px-2 py-0.5 rounded-button">
                        Pending
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex-1 border-t border-lightGrey pt-4">
              <h4 className="font-semibold text-sm text-darkNavy mb-2">Review current file</h4>
              <p className="text-xs text-gray-500 mb-4">{DOC_TYPE_LABELS[currentDoc.docType]}</p>

              {currentDoc.status === 'not_uploaded' ? (
                <div className="bg-lightGrey p-4 rounded-input text-xs text-center text-gray-500">
                  This document has not been uploaded. You cannot approve or reject it.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleApprove}
                      className={`flex-1 py-2.5 rounded-input text-sm font-semibold flex items-center justify-center gap-2 border transition-all ${
                        currentDecision?.decision === 'approve'
                          ? 'bg-success text-white border-success'
                          : 'bg-white text-gray-700 border-lightGrey hover:bg-lightGrey hover:bg-opacity-50'
                      }`}
                    >
                      <Check size={16} /> Approve
                    </button>
                    <button
                      type="button"
                      onClick={handleReject}
                      className={`flex-1 py-2.5 rounded-input text-sm font-semibold flex items-center justify-center gap-2 border transition-all ${
                        currentDecision?.decision === 'reject'
                          ? 'bg-error text-white border-error'
                          : 'bg-white text-gray-700 border-lightGrey hover:bg-lightGrey hover:bg-opacity-50'
                      }`}
                    >
                      <AlertTriangle size={16} /> Reject
                    </button>
                  </div>

                  {currentDecision?.decision === 'reject' && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-darkNavy mb-1">Rejection Reason Code</label>
                        <select
                          value={currentDecision.rejectionCode || KycRejectionCode.DOC_BLURRY}
                          onChange={(e) => handleRejectionCodeChange(e.target.value as KycRejectionCode)}
                          className="w-full px-3 py-2 border border-lightGrey rounded-input text-xs focus:outline-none focus:border-primaryGreen"
                        >
                          {REJECTION_CODES.map((item) => (
                            <option key={item.code} value={item.code}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-darkNavy mb-1">Notes / Instructions</label>
                        <textarea
                          value={currentDecision.rejectionReason || ''}
                          onChange={(e) => handleRejectionReasonChange(e.target.value)}
                          placeholder="Provide specific notes to help the driver correct this document..."
                          className="w-full px-3 py-2 border border-lightGrey rounded-input text-xs h-20 resize-none focus:outline-none focus:border-primaryGreen"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between p-4 border-t border-lightGrey bg-lightGrey bg-opacity-50">
          <span className="text-[10px] text-gray-500">
            Note: Decision applies to all checked documents. You can review one or more documents.
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              type="button"
              className="px-4 py-2 border border-lightGrey rounded-button bg-white text-sm font-semibold hover:bg-lightGrey transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              type="button"
              className="px-6 py-2 bg-primaryGreen text-white rounded-button text-sm font-semibold hover:bg-opacity-90 transition-all flex items-center gap-2"
            >
              {submitting ? 'Submitting...' : 'Submit Decision'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KycLightbox;
