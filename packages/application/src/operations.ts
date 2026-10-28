import type { StaffRole, VerifiedInventoryIntake, FulfillmentStage, OperationsKind } from "@yubie/domain";

export interface ShippingPolicyDraft {
  scope: "whole_city";
  policy: "free_promotional"; cities: string[]; amount: 0; serviceCoverage: string; costOwner: string;
  startsAt: string; endsAt: string; approvalRef: string; verification: VerifiedInventoryIntake["verification"];
}
export type OperationDraft =
  | { kind: "inventory_count"; payload: VerifiedInventoryIntake }
  | { kind: "shipping_policy"; payload: ShippingPolicyDraft }
  | { kind: "refund_full"; payload: { orderId: string; amount: number; reason: string; evidenceRef: string } };
export interface OperationRecord {
  id: string; kind: OperationsKind; status: "draft" | "approved" | "applied" | "rejected"; version: number;
  createdBy: string; approvedBy: string | null; createdAt: string; payload: unknown; result: unknown;
}
export interface VersionedOperation { expectedVersion: number; reason: string }
export interface FulfillmentOperation { expectedVersion: number; stage: FulfillmentStage; reason: string; carrier?: string | undefined; trackingNumber?: string | undefined }
export interface OperationsPort {
  stock(subject: string): Promise<unknown[]>;
  freezeCheckout(subject: string, key: string, input: { reason: string }): Promise<unknown>;
  staffGrant(subject: string, key: string, input: { subject: string; role: StaffRole; action: "grant" | "revoke"; approvalRef: string; reason: string }): Promise<unknown>;
  rolesFor(subject: string): Promise<StaffRole[]>;
  preview(subject: string, intake: VerifiedInventoryIntake): Promise<unknown>;
  create(subject: string, key: string, draft: OperationDraft): Promise<OperationRecord>;
  approve(subject: string, key: string, id: string, input: VersionedOperation): Promise<OperationRecord>;
  apply(subject: string, key: string, id: string, input: VersionedOperation): Promise<OperationRecord>;
  list(subject: string, resource: string, limit: number, cursor: string | null): Promise<{ items: unknown[]; nextCursor: string | null }>;
  orderDetail(subject: string, id: string): Promise<unknown>;
  fulfill(subject: string, key: string, id: string, input: FulfillmentOperation): Promise<unknown>;
  addNote(subject: string, key: string, id: string, input: { body: string; reason: string }): Promise<unknown>;
  reconcile(subject: string, key: string, paymentId: string, reason: string): Promise<unknown>;
  triage(subject: string, key: string, paymentId: string, input: { expectedVersion: number; state: "investigating" | "escalated" | "resolved"; reason: string }): Promise<unknown>;
  recordRefund(subject: string, key: string, id: string, input: VersionedOperation & { merchantReference: string; evidenceRef: string }): Promise<unknown>;
  confirmRefund(subject: string, key: string, id: string, input: VersionedOperation): Promise<unknown>;
  report(subject: string, date: string): Promise<unknown>;
}
