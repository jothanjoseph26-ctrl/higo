import {
  KYCStatus,
  KycDocType,
  KycDocumentMeta,
  VerificationTier,
} from '@higo/shared-types';

export const REQUIRED_KYC_DOCS: KycDocType[] = [
  KycDocType.NIN,
  KycDocType.DRIVERS_LICENCE,
  KycDocType.VEHICLE_REG,
  KycDocType.ROAD_WORTHINESS,
  KycDocType.INSURANCE,
];

export type KycDocumentsMap = Partial<Record<KycDocType, KycDocumentMeta>>;

export function isApproved(
  docs: KycDocumentsMap,
  docType: KycDocType,
): boolean {
  return docs[docType]?.status === KYCStatus.APPROVED;
}

export function computeVerificationTier(
  docs: KycDocumentsMap,
): VerificationTier {
  const nin = isApproved(docs, KycDocType.NIN);
  const licence = isApproved(docs, KycDocType.DRIVERS_LICENCE);
  const allFive = REQUIRED_KYC_DOCS.every((type) => isApproved(docs, type));

  if (allFive) return VerificationTier.TIER_3;
  if (nin && licence) return VerificationTier.TIER_2;
  if (nin) return VerificationTier.TIER_1;
  return VerificationTier.TIER_0;
}

export function computeOverallKycStatus(
  docs: KycDocumentsMap,
): KYCStatus {
  const uploaded = REQUIRED_KYC_DOCS.filter((type) => docs[type]);
  if (uploaded.length === 0) {
    return KYCStatus.PENDING;
  }

  const allApproved = REQUIRED_KYC_DOCS.every((type) =>
    isApproved(docs, type),
  );
  if (allApproved) {
    return KYCStatus.APPROVED;
  }

  const anyRejected = REQUIRED_KYC_DOCS.some(
    (type) => docs[type]?.status === KYCStatus.REJECTED,
  );
  if (anyRejected) {
    return KYCStatus.REJECTED;
  }

  return KYCStatus.UNDER_REVIEW;
}

/** Legal transition check when re-uploading a rejected document. */
export function canReupload(
  current: KYCStatus,
  docStatus: KYCStatus | undefined,
): boolean {
  return (
    current === KYCStatus.REJECTED &&
    docStatus === KYCStatus.REJECTED
  );
}

export function applyDocumentUpload(
  docs: KycDocumentsMap,
  meta: KycDocumentMeta,
): KycDocumentsMap {
  return { ...docs, [meta.docType]: meta };
}

export function applyReviewDecision(
  docs: KycDocumentsMap,
  docType: KycDocType,
  decision: 'approve' | 'reject',
  rejection?: { code: KycDocumentMeta['rejectionCode']; reason?: string },
  reviewedBy?: string,
): KycDocumentsMap {
  const existing = docs[docType];
  if (!existing) {
    return docs;
  }

  const reviewedAt = new Date().toISOString();
  if (decision === 'approve') {
    return {
      ...docs,
      [docType]: {
        ...existing,
        status: KYCStatus.APPROVED,
        rejectionCode: undefined,
        rejectionReason: undefined,
        reviewedAt,
        reviewedBy,
      },
    };
  }

  return {
    ...docs,
    [docType]: {
      ...existing,
      status: KYCStatus.REJECTED,
      rejectionCode: rejection?.code,
      rejectionReason: rejection?.reason,
      reviewedAt,
      reviewedBy,
    },
  };
}