import { validateInventoryOnboarding, type InventoryOnboardingInput } from "./inventory-onboarding.js";

export const STAFF_ROLES = ["viewer", "operator", "qc", "fulfillment", "finance", "admin"] as const;
export type StaffRole = typeof STAFF_ROLES[number];
export type OperationsPermission =
  | "orders:read" | "payments:read" | "inventory:read" | "inventory:propose" | "inventory:approve" | "inventory:apply"
  | "shipping:read" | "shipping:propose" | "shipping:approve" | "shipping:apply"
  | "fulfillment:read" | "fulfillment:write" | "exceptions:read" | "exceptions:triage" | "reconciliation:request"
  | "refunds:request" | "refunds:approve" | "refunds:record" | "reports:read" | "notes:write" | "staff:manage" | "audit:read" | "release:request";
const permissions: Record<StaffRole, readonly OperationsPermission[]> = {
  viewer: ["orders:read", "inventory:read", "shipping:read", "reports:read"],
  operator: ["orders:read", "inventory:read", "inventory:propose", "inventory:apply", "shipping:read", "shipping:propose", "shipping:apply", "notes:write", "reports:read"],
  qc: ["orders:read", "inventory:read", "inventory:approve", "shipping:read", "audit:read", "reports:read"],
  fulfillment: ["orders:read", "inventory:read", "shipping:read", "fulfillment:read", "fulfillment:write", "notes:write", "reports:read"],
  finance: ["orders:read", "payments:read", "inventory:read", "shipping:read", "shipping:approve", "exceptions:read", "exceptions:triage", "reconciliation:request", "refunds:request", "refunds:approve", "refunds:record", "reports:read", "audit:read"],
  admin: ["orders:read", "inventory:read", "shipping:read", "reports:read", "audit:read", "staff:manage", "release:request"],
};
export function canOperate(roles: readonly string[], permission: OperationsPermission): boolean {
  return roles.some(role => Object.hasOwn(permissions, role) && permissions[role as StaffRole].includes(permission));
}

export type OperationsKind = "inventory_count" | "shipping_policy" | "refund_full";
export function assertOperationsApproval(kind: OperationsKind, createdBy: string, approver: string, roles: readonly string[]): void {
  if (!createdBy || !approver || createdBy === approver) throw new Error("Approval requires a different named person / orang berbeda");
  const permission: OperationsPermission = kind === "inventory_count" ? "inventory:approve" : kind === "shipping_policy" ? "shipping:approve" : "refunds:approve";
  if (!canOperate(roles, permission)) throw new Error("Approval permission / izin required");
}

export function containsPendingEvidence(value: unknown): boolean {
  if (typeof value === "string") return /(?:^|[\s_-])(PENDING|PROPOSED|MISSING|BELUM|USULAN|NOT_FOR_IMPORT)(?:$|[\s_-])/i.test(value);
  if (Array.isArray(value)) return value.some(containsPendingEvidence);
  if (value && typeof value === "object") return Object.values(value).some(containsPendingEvidence);
  return false;
}
export interface VerifiedInventoryIntake {
  documentType: "YUBIE_VERIFIED_INVENTORY_INTAKE_V1";
  purpose: "initial_inventory" | "operational_count";
  sourceSha256: string;
  verification: { status: "VERIFIED"; evidenceRef: string; verifiedBy: string; verifiedAt: string };
  inventory: InventoryOnboardingInput;
}
export function validateVerifiedInventoryIntake(value: unknown, now: string): asserts value is VerifiedInventoryIntake {
  const input = value as Partial<VerifiedInventoryIntake> | null;
  if (!input || input.documentType !== "YUBIE_VERIFIED_INVENTORY_INTAKE_V1" || input.verification?.status !== "VERIFIED") throw new Error("A verified intake is required; proposal cannot be applied");
  if (containsPendingEvidence(input)) throw new Error("Pending / placeholder / belum evidence cannot be applied");
  if (!/^[a-f0-9]{64}$/.test(input.sourceSha256 ?? "") || !input.verification.evidenceRef?.trim() || !input.verification.verifiedBy?.trim()
    || !Number.isFinite(Date.parse(input.verification.verifiedAt)) || !["initial_inventory", "operational_count"].includes(input.purpose ?? "")) throw new Error("Verified source and physical evidence metadata required");
  validateInventoryOnboarding(input.inventory!, now);
  const countedAt = Date.parse(input.inventory!.countedAt), verifiedAt = Date.parse(input.verification.verifiedAt), current = Date.parse(now);
  if (countedAt > current + 60_000 || verifiedAt > current + 60_000 || verifiedAt < countedAt - 60_000) throw new Error("Physical count verification time cannot be future-dated or precede the count");
  const totals: Record<string, number> = {};
  for (const lot of input.inventory!.lots) {
    const policy = input.inventory!.policies.find(p => p.productId === lot.productId && p.sizeId === lot.sizeId);
    if (!policy || policy.components.length !== 1 || policy.components[0]?.productId !== lot.productId || policy.components[0].sizeId !== lot.sizeId || policy.components[0].quantity !== 1) throw new Error("A derived bundle/component cannot also have an independent physical lot");
    totals[lot.productId] = (totals[lot.productId] ?? 0) + lot.countedUncommittedQuantity;
  }
  if (input.purpose === "initial_inventory" && ["flour", "shake", "ppang", "mie"].some(f => totals[f] !== 20)) throw new Error("Initial physical family / keluarga totals must each equal 20");
}

export type FulfillmentStage = "packing" | "packed" | "shipped" | "delivered";
export function assertFulfillmentTransition(from: FulfillmentStage | null, to: FulfillmentStage, context: {
  orderStatus: string; paymentVerified: boolean; hold: string | null; carrier?: string | undefined; trackingNumber?: string | undefined;
}): void {
  if (!context.paymentVerified || !["paid", "processing", "shipped", "completed"].includes(context.orderStatus)) throw new Error("A verified paid payment is required");
  if (context.hold) throw new Error("Order fulfillment hold must be resolved");
  const next: Record<string, FulfillmentStage> = { none: "packing", packing: "packed", packed: "shipped", shipped: "delivered" };
  if (next[from ?? "none"] !== to) throw new Error("Invalid fulfillment transition");
  if (to === "shipped" && (!context.carrier?.trim() || !context.trackingNumber?.trim() || context.carrier.length > 100 || context.trackingNumber.length > 120)) throw new Error("Carrier and tracking number required");
}
export function assertFullRefund(input: { orderTotal: number; amount: number; paymentStatus: string; existingRefund: boolean }): void {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0 || input.amount !== input.orderTotal) throw new Error("Only a full / penuh refund is supported");
  if (input.paymentStatus !== "succeeded" || input.existingRefund) throw new Error("A succeeded paid payment without an existing refund is required");
}
