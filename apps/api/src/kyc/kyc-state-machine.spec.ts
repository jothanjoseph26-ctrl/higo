import {
  KYCStatus,
  KycDocType,
  KycDocumentMeta,
  KycRejectionCode,
  VerificationTier,
} from '@higo/shared-types';
import {
  applyReviewDecision,
  canReupload,
  computeOverallKycStatus,
  computeVerificationTier,
} from './kyc-state-machine';

function doc(
  docType: KycDocType,
  status: KYCStatus,
): KycDocumentMeta {
  return {
    docType,
    s3Key: `key/${docType}`,
    status,
    uploadedAt: new Date().toISOString(),
  };
}

describe('kyc-state-machine', () => {
  it('computes tier 1 when only NIN approved', () => {
    const tier = computeVerificationTier({
      [KycDocType.NIN]: doc(KycDocType.NIN, KYCStatus.APPROVED),
    });
    expect(tier).toBe(VerificationTier.TIER_1);
  });

  it('computes tier 2 when NIN and licence approved', () => {
    const tier = computeVerificationTier({
      [KycDocType.NIN]: doc(KycDocType.NIN, KYCStatus.APPROVED),
      [KycDocType.DRIVERS_LICENCE]: doc(
        KycDocType.DRIVERS_LICENCE,
        KYCStatus.APPROVED,
      ),
    });
    expect(tier).toBe(VerificationTier.TIER_2);
  });

  it('computes tier 3 and approved only when all five approved', () => {
    const docs = {
      [KycDocType.NIN]: doc(KycDocType.NIN, KYCStatus.APPROVED),
      [KycDocType.DRIVERS_LICENCE]: doc(
        KycDocType.DRIVERS_LICENCE,
        KYCStatus.APPROVED,
      ),
      [KycDocType.VEHICLE_REG]: doc(
        KycDocType.VEHICLE_REG,
        KYCStatus.APPROVED,
      ),
      [KycDocType.ROAD_WORTHINESS]: doc(
        KycDocType.ROAD_WORTHINESS,
        KYCStatus.APPROVED,
      ),
      [KycDocType.INSURANCE]: doc(KycDocType.INSURANCE, KYCStatus.APPROVED),
    };
    expect(computeVerificationTier(docs)).toBe(VerificationTier.TIER_3);
    expect(computeOverallKycStatus(docs)).toBe(KYCStatus.APPROVED);
  });

  it('marks overall rejected when any required doc rejected', () => {
    const status = computeOverallKycStatus({
      [KycDocType.NIN]: doc(KycDocType.NIN, KYCStatus.REJECTED),
      [KycDocType.DRIVERS_LICENCE]: doc(
        KycDocType.DRIVERS_LICENCE,
        KYCStatus.PENDING,
      ),
    });
    expect(status).toBe(KYCStatus.REJECTED);
  });

  it('allows re-upload after rejection', () => {
    expect(
      canReupload(KYCStatus.REJECTED, KYCStatus.REJECTED),
    ).toBe(true);
  });

  it('stores rejection code on reject decision', () => {
    const updated = applyReviewDecision(
      { [KycDocType.NIN]: doc(KycDocType.NIN, KYCStatus.PENDING) },
      KycDocType.NIN,
      'reject',
      { code: KycRejectionCode.DOC_BLURRY, reason: 'Too blurry' },
      'admin-1',
    );
    expect(updated[KycDocType.NIN]?.status).toBe(KYCStatus.REJECTED);
    expect(updated[KycDocType.NIN]?.rejectionCode).toBe(
      KycRejectionCode.DOC_BLURRY,
    );
  });
});