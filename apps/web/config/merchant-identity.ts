/**
 * Single source of truth for Yubie's published merchant identity and legal
 * policy metadata (iPaymu merchant verification requirement).
 *
 * Always-public facts are plain constants. Operator-verified facts (the exact
 * values registered on the owner-approved iPaymu merchant profile) are wrapped
 * in VerifiedMerchantField and default to null: a null field is OMITTED from
 * public HTML — never rendered as a placeholder. Release readiness while any
 * required field is null is enforced by
 * apps/web/scripts/verify-merchant-identity.mjs (exit 77), which the frontend
 * deploy runbook runs before any production storefront release.
 */

export interface VerifiedMerchantField<T> {
  value: T;
  /** Exact value as registered on the owner-approved iPaymu merchant profile. */
  provenance: "owner-approved-ipaymu-profile";
  /** ISO date of the owner's written confirmation. */
  verifiedAt: string;
}

export interface VerifiedSupportPhone extends VerifiedMerchantField<string> {
  /** E.164 tel: URL for the same number, e.g. tel:+6281234567890. */
  telUrl: string;
}

const unverified = null;

export const merchantIdentity = {
  brandName: "Yubie",
  tagline: "Rooted here. Made for now.",
  descriptor: "Modern Indonesian sweet-potato food brand",
  origin: "https://yubiefood.com",
  publicRegion: "Bogor, Jawa Barat, Indonesia",
  contactEmail: "hello@yubiefood.com",
  refundEmail: "hello@yubiefood.com",
  instagramUrl: "https://www.instagram.com/yubiefood.official/",
  tiktokUrl: "https://www.tiktok.com/@yubiefood.official",
  // Operator-verified identity — supply via an owner-approved commit that
  // fills each field with the exact value from the iPaymu merchant profile.
  legalOperatorName: unverified as VerifiedMerchantField<string> | null,
  entityType: unverified as VerifiedMerchantField<string> | null,
  registeredAddress: unverified as VerifiedMerchantField<string> | null,
  supportPhone: unverified as VerifiedSupportPhone | null,
  supportHours: unverified as VerifiedMerchantField<string> | null,
} as const;

export const merchantIdentityRequiredFields = [
  "legalOperatorName",
  "entityType",
  "registeredAddress",
  "supportPhone",
  "supportHours",
] as const;

export type RequiredMerchantIdentityField = (typeof merchantIdentityRequiredFields)[number];

export const missingMerchantIdentityFields: RequiredMerchantIdentityField[] = merchantIdentityRequiredFields.filter(
  (field) => merchantIdentity[field] === null,
);

/** True only when every iPaymu-required identity fact is owner-verified. */
export const merchantIdentityComplete: boolean = missingMerchantIdentityFields.length === 0;

/**
 * Legal policy metadata. Refund timelines below were approved by the owner on
 * 2026-10-31 and reflect the real manual-Finance workflow (full refunds only,
 * dual approval, executed in the iPaymu merchant dashboard — there is no
 * automated website refund). Settlement speed of banks/e-wallets is an
 * estimate outside Yubie's control and is worded as such.
 */
export const legalPolicy = {
  version: "1.0",
  /** Proposed effective date; finalize (owner) in the identity-approval commit. */
  effectiveDate: "2026-11-02",
  refundComplaintSubject: "[REFUND YUBIE] - Nomor Pesanan",
  refundTimelines: {
    acknowledgement: "paling lambat 1×24 jam pada hari kerja",
    investigation: "paling lambat 3 (tiga) hari kerja",
    approvedExecution: "paling lambat 5 (lima) hari kerja setelah refund disetujui",
    settlement:
      "mengikuti waktu proses bank atau penyedia pembayaran penerima (estimasi, di luar kendali Yubie)",
  },
} as const;
