export type ClaimStatus = "approved" | "pending" | "rejected";

export interface ProductClaim {
  id: string;
  text: string;
  approvalStatus: ClaimStatus;
  publicVisibility: boolean;
  verificationNote?: string;
}

export const claims: ProductClaim[] = [
  { id: "local", text: "Made from locally grown sweet potatoes", approvalStatus: "approved", publicVisibility: true },
  { id: "multi", text: "A multi-varietal sweet-potato approach", approvalStatus: "approved", publicVisibility: true },
  { id: "nutrition", text: "Nutrition facts require final verification", approvalStatus: "pending", publicVisibility: false, verificationNote: "verificationStatus: required" },
  { id: "certification", text: "Certification information requires final verification", approvalStatus: "pending", publicVisibility: false, verificationNote: "verificationStatus: required" },
];
