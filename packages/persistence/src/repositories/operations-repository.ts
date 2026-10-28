import { createHash, randomUUID } from "node:crypto";
import type { TransactionSql } from "postgres";
import { canOperate, assertOperationsApproval, validateVerifiedInventoryIntake, assertFulfillmentTransition, assertFullRefund, type StaffRole, type OperationsPermission, type OperationsKind, type FulfillmentStage, type VerifiedInventoryIntake } from "@yubie/domain";
import type { OperationsPort, OperationDraft, OperationRecord, VersionedOperation, FulfillmentOperation, ShippingPolicyDraft } from "@yubie/application";
import { operationsCreateSchema, operationsApprovalSchema, fulfillmentCommandSchema, operationNoteSchema, refundExecutionSchema, staffGrantSchema } from "@yubie/validation";
import type { Database } from "../client.js";
import { PostgresInventoryOnboarding } from "./inventory-onboarding.js";

export class OperationsError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) { super(message); this.name = "OperationsError"; }
}
function need(condition: unknown, code: string, status: number, message: string): asserts condition { if (!condition) throw new OperationsError(code, status, message); }
function reconciled(state: unknown): boolean { return state == null || state === "" || state === "reconciled_by_webhook"; }
function canonical(value: unknown): string { return JSON.stringify(value, (_key, item: unknown) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item); }
function hash(value: unknown): string { return createHash("sha256").update(canonical(value)).digest("hex"); }
type RequestRow = { id: string; kind: OperationsKind; status: OperationRecord["status"]; version: number; payload_json: unknown; payload_hash: string; created_by: string; approved_by: string | null; created_at: Date | string; result_json: unknown };
function view(row: RequestRow): OperationRecord { return { id: row.id, kind: row.kind, status: row.status, version: row.version, payload: row.payload_json, createdBy: row.created_by, approvedBy: row.approved_by, createdAt: new Date(row.created_at).toISOString(), result: row.result_json }; }
const proposePermission: Record<OperationsKind, OperationsPermission> = { inventory_count: "inventory:propose", shipping_policy: "shipping:propose", refund_full: "refunds:request" };
const applyPermission: Record<OperationsKind, OperationsPermission> = { inventory_count: "inventory:apply", shipping_policy: "shipping:apply", refund_full: "refunds:record" };
const approvePermission: Record<OperationsKind, OperationsPermission> = { inventory_count: "inventory:approve", shipping_policy: "shipping:approve", refund_full: "refunds:approve" };

/** All writes re-read staff grants inside the same transaction as state+audit+outbox. */
export class PostgresOperations implements OperationsPort {
  constructor(private readonly database: Database, private readonly options: { writesEnabled: boolean; checkoutAdmission: string; environment?: string }) {}
  async rolesFor(subject: string): Promise<StaffRole[]> {
    const rows = await this.database.client<{ role: StaffRole }[]>`SELECT role FROM ops_staff_grants WHERE subject=${subject} AND revoked_at IS NULL ORDER BY role`;
    return rows.map(row => row.role);
  }
  private async roles(tx: TransactionSql, subject: string): Promise<StaffRole[]> {
    const rows = await tx<{ role: StaffRole }[]>`SELECT role FROM ops_staff_grants WHERE subject=${subject} AND revoked_at IS NULL ORDER BY role FOR SHARE`;
    need(rows.length > 0, "FORBIDDEN", 403, "Staff permission revoked / izin dicabut");
    return rows.map(row => row.role);
  }
  private permit(roles: StaffRole[], permission: OperationsPermission) { need(canOperate(roles, permission), "FORBIDDEN", 403, "Staff permission / izin required"); }
  private async audit(tx: TransactionSql, actor: string, action: string, id: string, metadata: Record<string, unknown> = {}) {
    const eventId = `opevent_${randomUUID()}`;
    await tx`INSERT INTO ops_events(id,actor,action,resource_id,metadata_json,occurred_at) VALUES(${eventId},${actor},${action},${id},${JSON.stringify(metadata)}::jsonb,now())`;
    await tx`INSERT INTO audit_events(id,actor,action,resource_type,resource_id,occurred_at) VALUES(${'audit_'+randomUUID()},${actor},${action},'operations',${id},now())`;
    await tx`INSERT INTO outbox_events(id,event_type,aggregate_type,aggregate_id,payload_json,dedupe_key,status,available_at,attempt_count) VALUES(${'outbox_'+randomUUID()},'ops.changed','operations',${id},${JSON.stringify({ eventId, resourceId: id, action })}::jsonb,${'ops:'+eventId},'pending',now(),0)`;
  }
  private async command<T>(actor: string, key: string, action: string, input: unknown, work: (tx: TransactionSql, roles: StaffRole[]) => Promise<T>): Promise<T> {
    need(this.options.writesEnabled, "WRITES_DISABLED", 503, "Operations writes disabled");
    need(/^[A-Za-z0-9_-]{1,128}$/.test(key), "VALIDATION", 400, "Stable idempotency identity required");
    const digest = hash({ action, input });
    const committed = await this.database.client.begin(async tx => {
      const roles = await this.roles(tx, actor);
      // A replay is still a protected read: losing a capability must revoke it too.
      const fixedPermissions: Record<string, OperationsPermission> = { staff: "staff:manage", fulfill: "fulfillment:write", note: "notes:write", reconcile: "reconciliation:request", triage: "exceptions:triage", record_refund: "refunds:record", confirm_refund: "refunds:record" };
      let permission = fixedPermissions[action];
      if (action === "create") permission = proposePermission[(input as OperationDraft).kind];
      if (action === "approve" || action === "apply") {
        const operation = await tx<{ kind: OperationsKind }[]>`SELECT kind FROM ops_requests WHERE id=${(input as { id: string }).id}`;
        need(operation[0], "NOT_FOUND", 404, "Operation not found");
        permission = (action === "approve" ? approvePermission : applyPermission)[operation[0].kind];
      }
      need(permission, "FORBIDDEN", 403, "Operation permission required"); this.permit(roles, permission);
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${'ops-command:'+actor+':'+key},0))`;
      const previous = await tx`SELECT request_hash,result_json FROM ops_command_receipts WHERE actor=${actor} AND idempotency_key=${key}`;
      if (previous[0]) { need(previous[0].request_hash === digest, "IDEMPOTENCY_CONFLICT", 409, "Idempotency identity belongs to different input"); return { value: previous[0].result_json as T }; }
      const result = await work(tx, roles);
      await tx`INSERT INTO ops_command_receipts(actor,idempotency_key,request_hash,result_json,created_at) VALUES(${actor},${key},${digest},${JSON.stringify(result)}::jsonb,now())`;
      return { value: result };
    });
    return committed.value;
  }
  private async request(tx: TransactionSql, id: string): Promise<RequestRow> {
    const rows = await tx<RequestRow[]>`SELECT * FROM ops_requests WHERE id=${id} FOR UPDATE`;
    need(rows[0], "NOT_FOUND", 404, "Operation not found");
    need(rows[0].payload_hash === hash(rows[0].payload_json), "INTEGRITY", 409, "Operation payload changed after creation");
    return rows[0];
  }
  async staffGrant(actor: string, key: string, raw: { subject: string; role: StaffRole; action: "grant" | "revoke"; approvalRef: string; reason: string }) {
    const input = staffGrantSchema.parse(raw);
    return this.command(actor, key, "staff", input, async (tx, roles) => {
      this.permit(roles, "staff:manage");
      need(input.subject !== actor, "FORBIDDEN", 403, "Self permission changes require another approved administrator");
      await tx`SELECT pg_advisory_xact_lock(hashtextextended('ops-staff-grants',0))`;
      if (input.action === "grant") await tx`INSERT INTO ops_staff_grants(subject,role,granted_by,approval_ref,granted_at) VALUES(${input.subject},${input.role},${actor},${input.approvalRef},now()) ON CONFLICT(subject,role) DO UPDATE SET revoked_at=NULL,granted_by=EXCLUDED.granted_by,approval_ref=EXCLUDED.approval_ref,granted_at=now()`;
      else {
        if (input.role === "admin") need(Number((await tx`SELECT count(*)::int n FROM ops_staff_grants WHERE role='admin' AND revoked_at IS NULL`)[0]?.n) > 1, "CONFLICT", 409, "Last administrator cannot be removed");
        await tx`UPDATE ops_staff_grants SET revoked_at=now() WHERE subject=${input.subject} AND role=${input.role} AND revoked_at IS NULL`;
      }
      await this.audit(tx, actor, "ops.staff_"+input.action, input.subject, { role: input.role, approvalRef: input.approvalRef, reason: input.reason });
      return { subject: input.subject, role: input.role, action: input.action };
    });
  }
  private inventory(input: unknown): asserts input is VerifiedInventoryIntake {
    validateVerifiedInventoryIntake(input, new Date().toISOString());
    if ((this.options.environment ?? process.env.YUBIE_ENV) === "production") need(!/TEST_ONLY/i.test(JSON.stringify(input)), "VALIDATION", 400, "Synthetic test evidence cannot be used in production");
  }
  async preview(actor: string, intake: VerifiedInventoryIntake) {
    const roles = await this.rolesFor(actor); this.permit(roles, "inventory:propose"); this.inventory(intake);
    return new PostgresInventoryOnboarding(this.database).run({ ...intake.inventory, actor }, false);
  }
  async create(actor: string, key: string, raw: OperationDraft): Promise<OperationRecord> {
    const draft = operationsCreateSchema.parse(raw);
    if ((this.options.environment ?? process.env.YUBIE_ENV) === "production") need(!/TEST_ONLY/i.test(JSON.stringify(draft)), "VALIDATION", 400, "Synthetic test evidence cannot be used in production");
    return this.command(actor, key, "create", draft, async (tx, roles) => {
      this.permit(roles, proposePermission[draft.kind]);
      if (draft.kind === "inventory_count") { draft.payload.inventory.actor = actor; this.inventory(draft.payload); }
      if (draft.kind === "refund_full") await this.refundPayment(tx, draft.payload.orderId, draft.payload.amount);
      const id = `ops_${randomUUID()}`;
      const rows = await tx<RequestRow[]>`INSERT INTO ops_requests(id,kind,status,version,payload_json,payload_hash,created_by,created_at,updated_at) VALUES(${id},${draft.kind},'draft',1,${JSON.stringify(draft.payload)}::jsonb,${hash(draft.payload)},${actor},now(),now()) RETURNING *`;
      await this.audit(tx, actor, "ops.draft_created", id, { kind: draft.kind });
      return view(rows[0]!);
    });
  }
  async approve(actor: string, key: string, id: string, input: VersionedOperation): Promise<OperationRecord> {
    operationsApprovalSchema.parse(input);
    return this.command(actor, key, "approve", { id, ...input }, async (tx, roles) => {
      const request = await this.request(tx, id);
      need(request.status === "draft" && request.version === input.expectedVersion, "CONFLICT", 409, "Operation version or status changed");
      assertOperationsApproval(request.kind, request.created_by, actor, roles);
      if (request.kind === "inventory_count") this.inventory(request.payload_json);
      const rows = await tx<RequestRow[]>`UPDATE ops_requests SET status='approved',version=version+1,approved_by=${actor},approval_reason=${input.reason},approved_at=now(),updated_at=now() WHERE id=${id} RETURNING *`;
      await this.audit(tx, actor, "ops.approved", id, { reason: input.reason, version: rows[0]!.version });
      return view(rows[0]!);
    });
  }
  async apply(actor: string, key: string, id: string, input: VersionedOperation): Promise<OperationRecord> {
    operationsApprovalSchema.parse(input);
    return this.command(actor, key, "apply", { id, ...input }, async (tx, roles) => {
      const request = await this.request(tx, id); this.permit(roles, applyPermission[request.kind]);
      need(request.status === "approved" && request.version === input.expectedVersion && request.approved_by, "CONFLICT", 409, "Approved operation version required");
      this.permit(await this.roles(tx, request.approved_by), approvePermission[request.kind]);
      let result: unknown;
      if (request.kind === "inventory_count") {
        need(this.options.checkoutAdmission === "disabled", "CHECKOUT_MUST_BE_DISABLED", 409, "Checkout must be disabled / freeze before inventory apply");
        this.inventory(request.payload_json);
        result = await new PostgresInventoryOnboarding(this.database).runInTransaction(tx, { ...request.payload_json.inventory, actor }, true, request.approved_by);
      } else if (request.kind === "shipping_policy") {
        need(this.options.checkoutAdmission === "disabled", "CHECKOUT_MUST_BE_DISABLED", 409, "Checkout must be disabled before shipping apply");
        const draft = operationsCreateSchema.parse({ kind: "shipping_policy", payload: request.payload_json }).payload as ShippingPolicyDraft;
        const now = Date.now();
        need(Date.parse(draft.startsAt) <= now && Date.parse(draft.endsAt) > now, "VALIDATION", 400, "Shipping approval must be active");
        await tx`INSERT INTO shipping_policy_approvals(id,policy,cities,approval_ref,approved_by,starts_at,ends_at,service_coverage,cost_owner,source_request_id) VALUES(${id},'free_promotional',${JSON.stringify(draft.cities)}::jsonb,${draft.approvalRef},${request.approved_by},${draft.startsAt},${draft.endsAt},${draft.serviceCoverage},${draft.costOwner},${id})`;
        result = { policyId: id, cities: draft.cities, policy: draft.policy, amount: 0 };
      } else {
        const payload = request.payload_json as { orderId: string; amount: number };
        const payment = await this.refundPayment(tx, payload.orderId, payload.amount);
        await tx`INSERT INTO ops_refund_executions(request_id,order_id,payment_id,amount,state,updated_at) VALUES(${id},${payload.orderId},${payment.id},${payload.amount},'awaiting_merchant',now())`;
        result = { state: "awaiting_merchant", orderId: payload.orderId, amount: payload.amount, moneyMoved: false };
      }
      const rows = await tx<RequestRow[]>`UPDATE ops_requests SET status='applied',version=version+1,result_json=${JSON.stringify(result)}::jsonb,updated_at=now() WHERE id=${id} RETURNING *`;
      await this.audit(tx, actor, "ops.applied", id, { reason: input.reason, kind: request.kind });
      return view(rows[0]!);
    });
  }
  private async refundPayment(tx: TransactionSql, orderId: string, amount: number) {
    const orders = await tx`SELECT grand_total_amount,currency FROM orders WHERE id=${orderId} FOR UPDATE`;
    need(orders[0], "NOT_FOUND", 404, "Order not found");
    const payments = await tx`SELECT id,status,amount,currency,reconciliation_state FROM order_payments WHERE order_id=${orderId} AND status IN ('pending','succeeded','refunded') FOR UPDATE`;
    need(payments.length === 1 && reconciled(payments[0]!.reconciliation_state) && payments[0]!.amount === orders[0]!.grand_total_amount && payments[0]!.currency === orders[0]!.currency && orders[0]!.currency === "IDR", "CONFLICT", 409, "Payment must be uniquely reconciled before refund");
    const previous = await tx`SELECT request_id FROM ops_refund_executions WHERE payment_id=${payments[0]!.id}`;
    assertFullRefund({ orderTotal: Number(orders[0].grand_total_amount), amount, paymentStatus: String(payments[0]!.status), existingRefund: previous.length > 0 });
    return { id: String(payments[0]!.id) };
  }
  async list(actor: string, resource: string, limit: number, cursor: string | null) {
    need(Number.isInteger(limit) && limit >= 1 && limit <= 50, "VALIDATION", 400, "Bounded page required");
    const roles = await this.rolesFor(actor);
    const permission: Record<string, OperationsPermission> = { requests: "inventory:read", shipping: "shipping:read", audit: "audit:read", staff: "staff:manage", refunds: "payments:read", fulfillment: "fulfillment:read", notes: "notes:write" };
    need(permission[resource], "NOT_FOUND", 404, "Resource not found"); this.permit(roles, permission[resource]!);
    const decoded = cursor?.match(/^(\d{1,19})_([A-Za-z0-9_-]{1,60})$/);
    need(!cursor || decoded, "VALIDATION", 400, "Invalid cursor");
    const micros = decoded?.[1] ?? "0", id = decoded?.[2] ?? "";
    const rows = await this.database.client.begin("read only", async tx => {
      await tx`SET LOCAL statement_timeout='5s'`;
      if (resource === "requests") return tx`SELECT id,kind,status,version,created_by,approved_by,created_at,payload_json,result_json,(SELECT state FROM ops_refund_executions r WHERE r.request_id=ops_requests.id) refund_state,(extract(epoch from created_at)*1000000)::bigint::text created_micros FROM ops_requests WHERE (kind<>'refund_full' OR ${canOperate(roles, "payments:read")}) AND (${cursor === null} OR ((extract(epoch from created_at)*1000000)::bigint,id)<(${micros}::bigint,${id})) ORDER BY created_at DESC,id DESC LIMIT ${limit + 1}`;
      if (resource === "shipping") return tx`SELECT id,policy,cities,approval_ref,approved_by,starts_at,ends_at,service_coverage,cost_owner,(extract(epoch from starts_at)*1000000)::bigint::text created_micros FROM shipping_policy_approvals WHERE (${cursor === null} OR ((extract(epoch from starts_at)*1000000)::bigint,id)<(${micros}::bigint,${id})) ORDER BY starts_at DESC,id DESC LIMIT ${limit + 1}`;
      if (resource === "audit") return tx`SELECT id,actor,action,resource_id,metadata_json,occurred_at,(extract(epoch from occurred_at)*1000000)::bigint::text created_micros FROM ops_events WHERE (${cursor === null} OR ((extract(epoch from occurred_at)*1000000)::bigint,id)<(${micros}::bigint,${id})) ORDER BY occurred_at DESC,id DESC LIMIT ${limit + 1}`;
      if (resource === "staff") return tx`SELECT md5(subject||':'||role) id,subject,role,granted_by,approval_ref,granted_at,revoked_at,(extract(epoch from granted_at)*1000000)::bigint::text created_micros FROM ops_staff_grants WHERE (${cursor === null} OR ((extract(epoch from granted_at)*1000000)::bigint,md5(subject||':'||role))<(${micros}::bigint,${id})) ORDER BY granted_at DESC,id DESC LIMIT ${limit + 1}`;
      if (resource === "refunds") return tx`SELECT request_id id,order_id,payment_id,amount,state,merchant_reference,evidence_ref,recorded_by,confirmed_by,updated_at,(extract(epoch from updated_at)*1000000)::bigint::text created_micros FROM ops_refund_executions WHERE (${cursor === null} OR ((extract(epoch from updated_at)*1000000)::bigint,request_id)<(${micros}::bigint,${id})) ORDER BY updated_at DESC,request_id DESC LIMIT ${limit + 1}`;
      if (resource === "fulfillment") return tx`SELECT f.order_id id,f.stage,f.version,f.carrier,f.tracking_number,f.updated_at,o.fulfillment_hold,(extract(epoch from f.updated_at)*1000000)::bigint::text created_micros FROM ops_fulfillments f JOIN orders o ON o.id=f.order_id WHERE (${cursor === null} OR ((extract(epoch from f.updated_at)*1000000)::bigint,f.order_id)<(${micros}::bigint,${id})) ORDER BY f.updated_at DESC,f.order_id DESC LIMIT ${limit + 1}`;
      return tx`SELECT id,order_id,body,actor,created_at,(extract(epoch from created_at)*1000000)::bigint::text created_micros FROM ops_order_notes WHERE (${cursor === null} OR ((extract(epoch from created_at)*1000000)::bigint,id)<(${micros}::bigint,${id})) ORDER BY created_at DESC,id DESC LIMIT ${limit + 1}`;
    });
    const last = rows[limit - 1];
    return { items: rows.slice(0, limit).map(({ created_micros: _micros, ...row }) => row), nextCursor: rows.length > limit && last ? `${last.created_micros}_${last.id}` : null };
  }
  async orderDetail(actor: string, id: string) {
    const roles = await this.rolesFor(actor); this.permit(roles, "orders:read");
    return this.database.client.begin("read only", async tx => {
      const rows = await tx`SELECT id,checkout_ref,status,currency,grand_total_amount,lines_jsonb,fulfillment_hold,created_at FROM orders WHERE id=${id}`;
      need(rows[0], "NOT_FOUND", 404, "Order not found");
      const payments = canOperate(roles, "payments:read") ? await tx`SELECT id,provider,status,amount,reconciliation_state FROM order_payments WHERE order_id=${id} ORDER BY created_at` : [];
      const fulfillment = await tx`SELECT stage,version,carrier,tracking_number,updated_at FROM ops_fulfillments WHERE order_id=${id}`;
      const delivery = canOperate(roles, "fulfillment:read") ? await tx`SELECT customer_name,customer_phone,delivery_jsonb,shipping_jsonb FROM orders WHERE id=${id}` : [];
      return { ...rows[0], payments, fulfillment: fulfillment[0] ?? null, delivery: delivery[0] ?? null, piiAccess: delivery.length > 0 };
    });
  }
  async fulfill(actor: string, key: string, id: string, raw: FulfillmentOperation) {
    const input = fulfillmentCommandSchema.parse(raw);
    return this.command(actor, key, "fulfill", { id, ...input }, async (tx, roles) => {
      this.permit(roles, "fulfillment:write");
      const orders = await tx`SELECT status,fulfillment_hold,grand_total_amount,currency FROM orders WHERE id=${id} FOR UPDATE`; need(orders[0], "NOT_FOUND", 404, "Order not found");
      const payments = await tx`SELECT status,amount,currency,reconciliation_state FROM order_payments WHERE order_id=${id} AND status IN ('pending','succeeded','refunded') FOR UPDATE`;
      const previous = await tx`SELECT stage,version,carrier,tracking_number FROM ops_fulfillments WHERE order_id=${id} FOR UPDATE`;
      const row = previous[0]; need((row ? Number(row.version) : 0) === input.expectedVersion, "CONFLICT", 409, "Fulfillment version changed");
      const badLots = await tx`SELECT r.id FROM inventory_reservations r JOIN inventory_lots l ON l.id=r.lot_id WHERE r.order_id=${id} AND r.status IN ('active','consumed') AND (l.status IN ('recalled','quarantined','received') OR l.expiry_date<=CURRENT_DATE) LIMIT 1`;
      assertFulfillmentTransition(row?.stage as FulfillmentStage | undefined ?? null, input.stage, { orderStatus: String(orders[0].status), paymentVerified: payments.length === 1 && payments[0]!.status === "succeeded" && reconciled(payments[0]!.reconciliation_state) && payments[0]!.amount === orders[0]!.grand_total_amount && payments[0]!.currency === orders[0]!.currency && orders[0]!.currency === "IDR", hold: orders[0].fulfillment_hold || badLots.length ? "unresolved_fulfillment_hold" : null, carrier: input.carrier ?? row?.carrier, trackingNumber: input.trackingNumber ?? row?.tracking_number });
      const version = input.expectedVersion + 1;
      await tx`INSERT INTO ops_fulfillments(order_id,stage,version,carrier,tracking_number,updated_by,updated_at) VALUES(${id},${input.stage},${version},${input.carrier ?? row?.carrier ?? null},${input.trackingNumber ?? row?.tracking_number ?? null},${actor},now()) ON CONFLICT(order_id) DO UPDATE SET stage=EXCLUDED.stage,version=EXCLUDED.version,carrier=EXCLUDED.carrier,tracking_number=EXCLUDED.tracking_number,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at`;
      const status = input.stage === "shipped" ? "shipped" : input.stage === "delivered" ? "completed" : "processing";
      await tx`UPDATE orders SET status=${status},updated_at=now() WHERE id=${id}`;
      await this.audit(tx, actor, "ops.fulfillment_changed", id, { stage: input.stage, version, reason: input.reason });
      return { orderId: id, stage: input.stage, version };
    });
  }
  async addNote(actor: string, key: string, id: string, raw: { body: string; reason: string }) {
    const input = operationNoteSchema.parse(raw);
    return this.command(actor, key, "note", { id, ...input }, async (tx, roles) => {
      this.permit(roles, "notes:write"); need((await tx`SELECT id FROM orders WHERE id=${id}`).length, "NOT_FOUND", 404, "Order not found");
      const noteId = `note_${randomUUID()}`;
      await tx`INSERT INTO ops_order_notes(id,order_id,body,actor,created_at) VALUES(${noteId},${id},${input.body},${actor},now())`;
      await this.audit(tx, actor, "ops.note_added", id, { noteId, reason: input.reason }); return { id: noteId, orderId: id };
    });
  }
  async reconcile(actor: string, key: string, paymentId: string, reason: string) {
    need(reason.trim().length >= 3 && reason.length <= 300, "VALIDATION", 400, "Reason required");
    return this.command(actor, key, "reconcile", { paymentId, reason }, async (tx, roles) => {
      this.permit(roles, "reconciliation:request"); need((await tx`SELECT id FROM order_payments WHERE id=${paymentId}`).length, "NOT_FOUND", 404, "Payment not found");
      const eventId = `outbox_${randomUUID()}`;
      await tx`INSERT INTO outbox_events(id,event_type,aggregate_type,aggregate_id,payload_json,dedupe_key,status,available_at,attempt_count) VALUES(${eventId},'ops.payment_reconcile_requested','payment',${paymentId},${JSON.stringify({ paymentId })}::jsonb,${'reconcile:'+actor+':'+key},'pending',now(),0)`;
      await this.audit(tx, actor, "ops.reconciliation_requested", paymentId, { reason }); return { state: "queued", eventId, paymentSessionCreated: false };
    });
  }
  async triage(actor: string, key: string, paymentId: string, input: { expectedVersion: number; state: "investigating" | "escalated" | "resolved"; reason: string }) {
    need(["investigating", "escalated", "resolved"].includes(input.state) && Number.isSafeInteger(input.expectedVersion) && input.expectedVersion >= 0 && input.reason.trim().length >= 3 && input.reason.length <= 300, "VALIDATION", 400, "Invalid case update");
    return this.command(actor, key, "triage", { paymentId, ...input }, async (tx, roles) => {
      this.permit(roles, "exceptions:triage");
      const payment = await tx`SELECT p.status,p.reconciliation_state,p.amount,o.grand_total_amount,o.status order_status FROM order_payments p JOIN orders o ON o.id=p.order_id WHERE p.id=${paymentId} FOR UPDATE OF p`;
      need(payment[0], "NOT_FOUND", 404, "Payment not found");
      if (input.state === "resolved") need(reconciled(payment[0].reconciliation_state) && payment[0].amount === payment[0].grand_total_amount && !(payment[0].status === "succeeded" && !["paid", "processing", "shipped", "completed"].includes(payment[0].order_status)), "CONFLICT", 409, "Authoritative payment exception remains unresolved");
      const prior = await tx`SELECT version FROM ops_exception_cases WHERE payment_id=${paymentId} FOR UPDATE`;
      need(Number(prior[0]?.version ?? 0) === input.expectedVersion, "CONFLICT", 409, "Case version changed");
      const version = input.expectedVersion + 1;
      await tx`INSERT INTO ops_exception_cases(payment_id,state,version,updated_by,updated_at) VALUES(${paymentId},${input.state},${version},${actor},now()) ON CONFLICT(payment_id) DO UPDATE SET state=EXCLUDED.state,version=EXCLUDED.version,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at`;
      await this.audit(tx, actor, "ops.exception_triaged", paymentId, { state: input.state, reason: input.reason }); return { paymentId, state: input.state, version };
    });
  }
  async recordRefund(actor: string, key: string, id: string, raw: VersionedOperation & { merchantReference: string; evidenceRef: string }) {
    const input = refundExecutionSchema.parse(raw);
    return this.command(actor, key, "record_refund", { id, ...input }, async (tx, roles) => {
      this.permit(roles, "refunds:record"); const request = await this.request(tx, id);
      need(request.kind === "refund_full" && request.status === "applied" && request.version === input.expectedVersion, "CONFLICT", 409, "Approved full refund handoff required");
      const rows = await tx`UPDATE ops_refund_executions SET state='merchant_execution_recorded',merchant_reference=${input.merchantReference},evidence_ref=${input.evidenceRef},recorded_by=${actor},updated_at=now() WHERE request_id=${id} AND state='awaiting_merchant' RETURNING request_id`;
      need(rows.length, "CONFLICT", 409, "Merchant execution already recorded");
      await tx`UPDATE ops_requests SET version=version+1,updated_at=now() WHERE id=${id}`;
      await this.audit(tx, actor, "ops.refund_execution_recorded", id, { reason: input.reason }); return { requestId: id, state: "merchant_execution_recorded", paymentStatusChanged: false, version: request.version + 1 };
    });
  }
  async confirmRefund(actor: string, key: string, id: string, input: VersionedOperation) {
    operationsApprovalSchema.parse(input);
    return this.command(actor, key, "confirm_refund", { id, ...input }, async (tx, roles) => {
      this.permit(roles, "refunds:record"); const request = await this.request(tx, id);
      need(request.version === input.expectedVersion && request.kind === "refund_full", "CONFLICT", 409, "Refund version changed");
      const rows = await tx`SELECT r.*,p.status payment_status,p.amount payment_amount,p.reconciliation_state FROM ops_refund_executions r JOIN order_payments p ON p.id=r.payment_id WHERE r.request_id=${id} FOR UPDATE OF r,p`;
      const row = rows[0]; need(row && row.state === "merchant_execution_recorded" && row.recorded_by !== actor && row.payment_status === "refunded" && row.amount === row.payment_amount && reconciled(row.reconciliation_state), "CONFLICT", 409, "A different Finance reviewer and authoritative provider-confirmed full refund are required");
      await tx`UPDATE ops_refund_executions SET state='provider_and_finance_confirmed',confirmed_by=${actor},updated_at=now() WHERE request_id=${id}`;
      await tx`UPDATE ops_requests SET version=version+1,updated_at=now() WHERE id=${id}`;
      await this.audit(tx, actor, "ops.refund_confirmed", id, { reason: input.reason }); return { requestId: id, state: "provider_and_finance_confirmed", stockRestocked: false, version: request.version + 1 };
    });
  }
  async report(actor: string, date: string) {
    const roles = await this.rolesFor(actor); this.permit(roles, "reports:read");
    need(/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)), "VALIDATION", 400, "Business date required");
    return this.database.client.begin("read only", async tx => {
      const [orders] = await tx`SELECT count(*)::int orders, count(*) FILTER(WHERE status='pending_payment')::int awaiting_payment, count(*) FILTER(WHERE status='cancelled')::int cancelled FROM orders WHERE (created_at AT TIME ZONE 'Asia/Jakarta')::date=${date}::date`;
      const [lots] = await tx`SELECT count(*)::int lots,coalesce(sum(quantity_on_hand) FILTER(WHERE status='released' AND expiry_date>CURRENT_DATE),0)::int available_units,count(*) FILTER(WHERE expiry_date<=CURRENT_DATE+30)::int expiring_or_expired_lots FROM inventory_lots`;
      const [reserved] = await tx`SELECT coalesce(sum(quantity),0)::int reserved_units FROM inventory_reservations WHERE status='active'`;
      const [shipments] = await tx`SELECT count(*) FILTER(WHERE stage='packing')::int packing,count(*) FILTER(WHERE stage='packed')::int packed,count(*) FILTER(WHERE stage='shipped')::int shipped,count(*) FILTER(WHERE stage='delivered')::int delivered FROM ops_fulfillments`;
      const [money] = canOperate(roles, "payments:read") ? await tx`SELECT count(*) FILTER(WHERE status='succeeded')::int paid_payments,coalesce(sum(amount) FILTER(WHERE status='succeeded'),0)::bigint::text captured_idr,coalesce(sum(amount) FILTER(WHERE status='refunded'),0)::bigint::text refunded_idr FROM order_payments WHERE (created_at AT TIME ZONE 'Asia/Jakarta')::date=${date}::date` : [];
      return { businessDate: date, timeZone: "Asia/Jakarta", orders, inventory: { ...lots, ...reserved, reservationAlreadyExcludedFromAvailable: true }, fulfillment: shipments, finance: money ? { ...money, basis: "current_status_of_payments_created_on_business_date", settlementReport: false } : null, checkoutAdmission: this.options.checkoutAdmission };
    });
  }
}
