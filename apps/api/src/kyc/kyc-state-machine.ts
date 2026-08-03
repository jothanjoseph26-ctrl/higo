import {
  KYCStatus,
  KycDocType,
  KycDocumentMeta,
  VehicleType,
  VerificationTier,
} from '@higo/shared-types';

/** Full document set for car/bike drivers - a keke has no license/insurance/roadworthiness expectation. */
export const REQUIRED_KYC_DOCS: KycDocType[] = [
  KycDocType.NIN,
  KycDocType.DRIVERS_LICENCE,
  KycDocType.VEHICLE_REG,
  KycDocType.ROAD_WORTHINESS,
  KycDocType.INSURANCE,
];

/** Keke (tricycle) drivers only need identity + proof of vehicle ownership. */
const KEKE_REQUIRED_KYC_DOCS: KycDocType[] = [
  KycDocType.NIN,
  KycDocType.VEHICLE_REG,
];

export function getRequiredKycDocs(
  vehicleType?: VehicleType | string | null,
): KycDocType[] {
  return vehicleType === VehicleType.KEKE
    ? KEKE_REQUIRED_KYC_DOCS
    : REQUIRED_KYC_DOCS;
}

export type KycDocumentsMap = Partial<Record<KycDocType, KycDocumentMeta>>;

export function isApproved(
  docs: KycDocumentsMap,
  docType: KycDocType,
): boolean {
  return docs[docType]?.status === KYCStatus.APPROVED;
}

export function computeVerificationTier(
  docs: KycDocumentsMap,
  vehicleType?: VehicleType | string | null,
): VerificationTier {
  const required = getRequiredKycDocs(vehicleType);
  const nin = isApproved(docs, KycDocType.NIN);
  const licence = isApproved(docs, KycDocType.DRIVERS_LICENCE);
  const allRequired = required.every((type) => isApproved(docs, type));

  if (allRequired) return VerificationTier.TIER_3;
  if (vehicleType === VehicleType.KEKE) {
    // No licence concept for keke - identity-only verification caps at TIER_1.
    return nin ? VerificationTier.TIER_1 : VerificationTier.TIER_0;
  }
  if (nin && licence) return VerificationTier.TIER_2;
  if (nin) return VerificationTier.TIER_1;
  return VerificationTier.TIER_0;
}

export function computeOverallKycStatus(
  docs: KycDocumentsMap,
  vehicleType?: VehicleType | string | null,
): KYCStatus {
  const required = getRequiredKycDocs(vehicleType);
  const uploaded = required.filter((type) => docs[type]);
  if (uploaded.length === 0) {
    return KYCStatus.PENDING;
  }

  const allApproved = required.every((type) => isApproved(docs, type));
  if (allApproved) {
    return KYCStatus.APPROVED;
  }

  const anyRejected = required.some(
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