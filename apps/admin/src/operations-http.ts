import type { OperationsPort } from "@yubie/application";
import { canOperate, type StaffRole, type OperationsPermission } from "@yubie/domain";
import { operationsCreateSchema, operationsApprovalSchema, verifiedInventoryIntakeSchema, fulfillmentCommandSchema, operationNoteSchema, refundExecutionSchema, staffGrantSchema, exceptionTriageSchema } from "@yubie/validation";

function json(body: unknown, status = 200) { return Response.json(body, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } }); }
const getPermissions: Record<string, OperationsPermission> = { stock: "inventory:read", movements: "inventory:read", cases: "exceptions:read", requests: "inventory:read", shipping: "shipping:read", audit: "audit:read", staff: "staff:manage", refunds: "payments:read", fulfillment: "fulfillment:read", notes: "notes:write" };
const ids = "([A-Za-z0-9_-]{1,100})";

/** Staff transport only. The port rechecks database grants and owns transactions. */
export async function handleOperationsRequest(request: Request, subject: string, roles: StaffRole[], operations: OperationsPort): Promise<Response | null> {
  const url = new URL(request.url);
  const resource = /^\/v1\/([a-z-]+)$/.exec(url.pathname)?.[1];
  const detail = new RegExp(`^/v1/orders/${ids}$`).exec(url.pathname);
  const action = new RegExp(`^/v1/requests/${ids}/(approve|apply|refund-execution|refund-confirmation)$`).exec(url.pathname);
  const orderAction = new RegExp(`^/v1/orders/${ids}/(fulfillment|notes|shipment\/requeue)$`).exec(url.pathname);
  const paymentAction = new RegExp(`^/v1/payments/${ids}/(reconcile|triage)$`).exec(url.pathname);
  const known = resource && Object.hasOwn(getPermissions, resource) || detail || action || orderAction || paymentAction || ["/v1/inventory/preview", "/v1/reports/daily", "/v1/checkout-freeze"].includes(url.pathname);
  if (!known) return null;
  const allowed = (permission: OperationsPermission) => canOperate(roles, permission);
  try {
    if (request.method === "GET") {
      if (detail) return allowed("orders:read") ? json({ ok: true, data: await operations.orderDetail(subject, detail[1]!) }) : json({ ok: false, code: "FORBIDDEN" }, 403);
      if (url.pathname === "/v1/reports/daily") return allowed("reports:read") ? json({ ok: true, data: await operations.report(subject, url.searchParams.get("date") ?? "") }) : json({ ok: false, code: "FORBIDDEN" }, 403);
      if (resource && getPermissions[resource]) {
        if (!allowed(getPermissions[resource]!)) return json({ ok: false, code: "FORBIDDEN" }, 403);
        const limit = Number(url.searchParams.get("limit") ?? 20), cursor = url.searchParams.get("cursor");
        if (!Number.isInteger(limit) || limit < 1 || limit > 50 || cursor && !/^\d{1,19}_[A-Za-z0-9_-]{1,60}$/.test(cursor)) return json({ ok: false, code: "VALIDATION" }, 400);
        const page = resource === "stock" ? { items: await operations.stock(subject), nextCursor: null } : await operations.list(subject, resource, limit, cursor);
        return json({ ok: true, data: { ...page, source: "reader", roles } });
      }
      return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
    }
    if (request.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
    let permission: OperationsPermission | null = url.pathname === "/v1/checkout-freeze" ? "inventory:apply" : resource === "staff" ? "staff:manage" : url.pathname === "/v1/inventory/preview" ? "inventory:propose" : orderAction?.[2] === "fulfillment" ? "fulfillment:write" : orderAction?.[2] === "notes" ? "notes:write" : orderAction?.[2] === "shipment/requeue" ? "fulfillment:write" : paymentAction?.[2] === "reconcile" ? "reconciliation:request" : paymentAction?.[2] === "triage" ? "exceptions:triage" : action?.[2]?.startsWith("refund-") ? "refunds:record" : null;
    if (permission && !allowed(permission)) return json({ ok: false, code: "FORBIDDEN" }, 403);
    if (action?.[2] === "approve" && !["inventory:approve", "shipping:approve", "refunds:approve"].some(p => allowed(p as OperationsPermission))) return json({ ok: false, code: "FORBIDDEN" }, 403);
    if (action?.[2] === "apply" && !["inventory:apply", "shipping:apply", "refunds:record"].some(p => allowed(p as OperationsPermission))) return json({ ok: false, code: "FORBIDDEN" }, 403);
    const key = request.headers.get("idempotency-key") ?? "";
    if (url.pathname !== "/v1/inventory/preview" && !/^[A-Za-z0-9_-]{1,128}$/.test(key)) return json({ ok: false, code: "IDEMPOTENCY_REQUIRED" }, 400);
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > 131072) return json({ ok: false, code: "VALIDATION" }, 413);
    let body: unknown;
    try { body = JSON.parse(text); } catch { return json({ ok: false, code: "VALIDATION" }, 400); }
    let data: unknown;
    if (url.pathname === "/v1/checkout-freeze") data = await operations.freezeCheckout(subject, key, operationsApprovalSchema.pick({ reason: true }).parse(body));
    else if (resource === "staff") data = await operations.staffGrant(subject, key, staffGrantSchema.parse(body));
    else if (url.pathname === "/v1/requests") {
      const input = operationsCreateSchema.parse(body);
      permission = input.kind === "inventory_count" ? "inventory:propose" : input.kind === "shipping_policy" ? "shipping:propose" : "refunds:request";
      if (!allowed(permission)) return json({ ok: false, code: "FORBIDDEN" }, 403);
      data = await operations.create(subject, key, input);
    } else if (url.pathname === "/v1/inventory/preview") data = await operations.preview(subject, verifiedInventoryIntakeSchema.parse(body));
    else if (action) {
      const id = action[1]!;
      if (action[2] === "approve") data = await operations.approve(subject, key, id, operationsApprovalSchema.parse(body));
      else if (action[2] === "apply") data = await operations.apply(subject, key, id, operationsApprovalSchema.parse(body));
      else if (action[2] === "refund-execution") data = await operations.recordRefund(subject, key, id, refundExecutionSchema.parse(body));
      else data = await operations.confirmRefund(subject, key, id, operationsApprovalSchema.parse(body));
    } else if (orderAction) {
      if (orderAction[2] === "fulfillment") data = await operations.fulfill(subject, key, orderAction[1]!, fulfillmentCommandSchema.parse(body));
      else if (orderAction[2] === "shipment/requeue") data = await operations.requeueShipment?.(subject, key, orderAction[1]!, operationsApprovalSchema.pick({ reason: true }).parse(body).reason) ?? { orderId: orderAction[1], requeued: false };
      else data = await operations.addNote(subject, key, orderAction[1]!, operationNoteSchema.parse(body));
    } else if (paymentAction) {
      if (paymentAction[2] === "reconcile") {
        const input = operationsApprovalSchema.pick({ reason: true }).parse(body);
        data = await operations.reconcile(subject, key, paymentAction[1]!, input.reason);
      } else {
        data = await operations.triage(subject, key, paymentAction[1]!, exceptionTriageSchema.parse(body));
      }
    } else return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
    return json({ ok: true, data });
  } catch (error: unknown) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (error instanceof Error && error.name === "ZodError") return json({ ok: false, code: "VALIDATION" }, 400);
    if (error && typeof error === "object" && "status" in error && typeof error.status === "number" && [400, 403, 404, 409, 503].includes(error.status)) return json({ ok: false, code: code || "UNAVAILABLE" }, error.status);
    if (code === "23505") return json({ ok: false, code: "CONFLICT" }, 409);
    // Domain refusals are bounded; infrastructure failures never disclose values.
    if (error instanceof Error && /verified|proposal|pending|placeholder|family|component|bundle|inventory|QC|stale|expiry|different|permission|transition|tracking|carrier|hold|full|succeeded/i.test(error.message)) return json({ ok: false, code: "VALIDATION" }, 400);
    return json({ ok: false, code: "UNAVAILABLE" }, 503);
  }
}
