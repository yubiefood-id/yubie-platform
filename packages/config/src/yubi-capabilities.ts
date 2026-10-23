import type { LaunchProfile } from "./launch.js";

const PDP_ROUTES=["flour","shake","ppang","mie"].map(id=>`/products/yubie-${id}`);
/** Evidence comes only from the protected, audited operator release record. */
export interface WebsiteReleaseEvidence {
  approvalStatus: "APPROVED";
  approvalRef: string;
  sourceSha: string;
  sourceDirty: false;
  artifactDigest: string;
  canonicalOrigin: "https://yubiefood.com";
  launchProfile: LaunchProfile;
  paymentMode: string;
  verifiedRoutes: string[];
  authenticationAccepted?: boolean;
  sandboxCheckoutAccepted?: boolean;
}
export function isApprovedWebsiteEvidence(value: unknown, profile: LaunchProfile): value is WebsiteReleaseEvidence {
  if(!value || typeof value!=="object")return false;
  const v=value as Partial<WebsiteReleaseEvidence>;
  return v.approvalStatus==="APPROVED" && typeof v.approvalRef==="string" && v.approvalRef.length>0 && /^[a-f0-9]{40}$/.test(v.sourceSha??"") && v.sourceDirty===false && /^sha256:[a-f0-9]{64}$/.test(v.artifactDigest??"") && v.canonicalOrigin==="https://yubiefood.com" && v.launchProfile===profile && Array.isArray(v.verifiedRoutes) && PDP_ROUTES.every(p=>v.verifiedRoutes!.includes(p));
}
export function deriveYubiCapabilities(profile: LaunchProfile,evidence: unknown,environment: string,supportAccepted=false) {
  const accepted=isApprovedWebsiteEvidence(evidence,profile);
  const sandbox=accepted && profile==="DIRECT_COMMERCE_SANDBOX" && ["test","development","staging"].includes(environment);
  const account=!!(sandbox && evidence.authenticationAccepted);
  return {
    catalog_available:accepted,
    account_available:account,
    checkout_available:!!(sandbox && evidence.sandboxCheckoutAccepted && evidence.paymentMode!=="live"),
    order_portal_available:!!(account && evidence.verifiedRoutes.includes("/account/orders")),
    human_support_available:supportAccepted,
  };
}
