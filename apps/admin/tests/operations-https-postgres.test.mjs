import assert from "node:assert/strict";
import test from "node:test";
import { createServer, request } from "node:https";
import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { createDatabase, closeDatabase, PostgresOperations, PostgresAdminReaders, PostgresAuditRepository, PostgresAdminSessionRepository } from "@yubie/persistence";
import { GoogleIdTokenVerifier } from "@yubie/integrations";
import { adminHttpHandler } from "../dist/runtime.js";

test("isolated HTTPS staff identity, operator workflow and audit acceptance", { skip: !process.env.DATABASE_URL }, async t => {
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname), "Acceptance may only use isolated loopback PostgreSQL");
  const admin = postgres(url.toString(), { max: 1 });
  const name = "yubie_admin_https_" + randomUUID().replaceAll("-", "");
  await admin`CREATE DATABASE ${admin(name)}`;
  url.pathname = "/" + name;
  const db = createDatabase(url.toString());
  const directory = mkdtempSync(join(tmpdir(), "yubie-admin-https-test-"));
  let server;
  try {
    const migrations = new URL("../../../packages/persistence/migrations/", import.meta.url);
    for (const file of readdirSync(migrations).filter(f => f.endsWith(".sql")).sort()) await db.client.unsafe(readFileSync(new URL(file, migrations), "utf8"));
    const grants = { operator: ["operator"], qc: ["qc"], packer: ["fulfillment"], finance: ["finance"], reviewer: ["finance"], owner: ["admin"], viewer: ["viewer"] };
    // Synthetic paid record is confined to this disposable database; no provider is called.
    await db.client`INSERT INTO orders(id,checkout_ref,checkout_public_token,status,customer_name,customer_phone,delivery_jsonb,currency,subtotal_amount,discount_amount,grand_total_amount,total_amount,created_at,updated_at) VALUES('TEST_ONLY_ORDER','TEST_ONLY_REF','TEST_ONLY_PUBLIC_TOKEN','paid','TEST_ONLY_CUSTOMER','+6200000000000','{"city":"TEST_ONLY_CITY"}'::jsonb,'IDR',35000,0,35000,35000,now(),now())`;
    await db.client`INSERT INTO order_payments(id,order_id,provider,provider_session_id,provider_payment_id,currency,status,amount,created_at,updated_at) VALUES('TEST_ONLY_PAYMENT','TEST_ONLY_ORDER','ipaymu','TEST_ONLY_SESSION','1001','IDR','succeeded',35000,now(),now())`;
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const audience = "TEST_ONLY_STAFF_OIDC_CLIENT";
    const digest = value => createHash("sha256").update(value).digest("hex");
    const sourceSha = "a".repeat(40), now = Date.now();
    const firstAdminApproval = { action: "bootstrap_first_named_admin", role: "admin", approvalId: "TEST_ONLY_FIRST_ADMIN", sourceSha, audienceSha256: digest(audience), emailSha256: digest("owner@example.invalid"), approvedBy: "TEST_ONLY_OWNER", approvalRef: "TEST_ONLY_NAMED_APPROVAL", notBefore: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 600000).toISOString() };
    const verifier = new GoogleIdTokenVerifier({ clientId: audience, fetchFn: async () => ({ ok: true, json: async () => ({ keys: [{ ...publicKey.export({ format: "jwk" }), kid: "TEST_ONLY_KEY" }] }) }) });
    const credential = (subject, patch = {}) => {
      const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "TEST_ONLY_KEY" })).toString("base64url");
      const body = Buffer.from(JSON.stringify({ iss: "https://accounts.google.com", aud: audience, sub: subject, email: subject === "owner" ? "owner@example.invalid" : subject + "@example.invalid", exp: Math.floor(Date.now() / 1000) + 600, email_verified: true, ...patch })).toString("base64url");
      return `${header}.${body}.${sign("RSA-SHA256", Buffer.from(`${header}.${body}`), privateKey).toString("base64url")}`;
    };
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(directory, "key.pem"), "-out", join(directory, "cert.pem"), "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost"], { stdio: "ignore" });
    let origin;
    const sessions = new PostgresAdminSessionRepository(db);
    let writesEnabled = false;
    const options = () => ({ sessionSecret: "TEST_ONLY_ISOLATED_SESSION_SECRET_32_BYTES", nowMs: Date.now(), googleClientId: audience, initialStaffApproval: () => firstAdminApproval, releaseSha: sourceSha, verifier, sessions, operations: new PostgresOperations(db, { writesEnabled, checkoutAdmission: "disabled", staffBootstrapContext: { sourceSha, audienceSha256: digest(audience) } }), readers: new PostgresAdminReaders(db), audit: new PostgresAuditRepository(db) });
    let handler;
    server = createServer({ key: readFileSync(join(directory, "key.pem")), cert: readFileSync(join(directory, "cert.pem")) }, (req, res) => handler(req, res));
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    origin = `https://localhost:${server.address().port}`;
    handler = adminHttpHandler(options, origin, fileURLToPath(new URL("../dist/public/", import.meta.url)));
    const ca = readFileSync(join(directory, "cert.pem"));
    const clients = new Map();
    function client() {
      const cookies = new Map(); let csrf;
      return {
        cookies,
        async call(path, body, headers = {}) {
          const data = body === undefined ? null : JSON.stringify(body);
          return new Promise((resolve, reject) => {
            const req = request({ hostname: "127.0.0.1", servername: "localhost", port: server.address().port, path, ca, method: data === null ? "GET" : "POST", headers: { host: new URL(origin).host, cookie: [...cookies].map(([k, v]) => k + "=" + v).join("; "), ...(data ? { "content-type": "application/json", origin, "x-yubie-csrf": csrf || "", "idempotency-key": "TEST_ONLY_" + randomUUID() } : {}), ...headers } }, response => {
              let raw = ""; response.on("data", chunk => raw += chunk); response.on("end", () => {
                for (const cookie of response.headers["set-cookie"] || []) { const part = cookie.split(";")[0], index = part.indexOf("="); cookies.set(part.slice(0, index), part.slice(index + 1)); }
                try {
                  const parsed = JSON.parse(raw); if (parsed.data?.csrfToken) csrf = parsed.data.csrfToken;
                  resolve({ status: response.statusCode, body: parsed, headers: response.headers });
                } catch (error) { reject(error); }
              });
            }); req.on("error", reject); req.setTimeout(5000, () => req.destroy(new Error("Isolated HTTPS request timeout"))); req.end(data || undefined);
          });
        },
        async login(subject, patch) { await this.call("/auth/config"); return this.call("/auth/google", { credential: credential(subject, patch), role: "admin" }); },
      };
    }
    const notApproved = client();
    assert.equal((await notApproved.login("unapproved")).status, 403);
    assert.equal((await notApproved.login("owner", { email_verified: false })).status, 403);
    assert.equal((await db.client`SELECT count(*)::int n FROM ops_staff_grants`)[0].n, 0);
    await db.client.unsafe("CREATE FUNCTION isolated_bootstrap_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST_ONLY audit outage'; END; $$; CREATE TRIGGER isolated_bootstrap_audit_failure BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION isolated_bootstrap_audit_failure();");
    assert.equal((await notApproved.login("owner")).status, 503);
    assert.equal((await db.client`SELECT count(*)::int n FROM ops_staff_grants`)[0].n, 0, "Failed audit must roll back the privileged grant");
    await db.client.unsafe("DROP TRIGGER isolated_bootstrap_audit_failure ON audit_events; DROP FUNCTION isolated_bootstrap_audit_failure();");
    const firstOwner = client(), secondTab = client();
    const initialLogins = await Promise.all([firstOwner.login("owner"), secondTab.login("owner")]);
    assert.deepEqual(initialLogins.map(response => response.status), [200, 200], "Only the approved verified email may bootstrap its actual Google subject");
    assert.deepEqual(Array.from(await db.client`SELECT subject,role FROM ops_staff_grants`), [{ subject: "owner", role: "admin" }]);
    assert.equal((await db.client`SELECT count(*)::int n FROM ops_events WHERE action='ops.first_admin_bootstrap'`)[0].n, 1);
    assert.equal((await firstOwner.call("/v1/staff", { subject: "unapproved", role: "finance", action: "grant", approvalRef: "TEST_ONLY_DISABLED", reason: "TEST_ONLY writes still disabled" })).status, 503);
    assert.equal((await db.client`SELECT count(*)::int n FROM ops_staff_grants`)[0].n, 1);
    assert.equal((await db.client`SELECT count(*)::int n FROM ops_checkout_freeze`)[0].n, 0);
    writesEnabled = true;
    clients.set("owner", firstOwner);
    for (const [subject, roles] of Object.entries(grants)) {
      if (subject === "owner") continue;
      for (const role of roles) assert.equal((await firstOwner.call("/v1/staff", { subject, role, action: "grant", approvalRef: "TEST_ONLY_NAMED_STAFF", reason: "TEST_ONLY owner-approved staff" })).status, 200);
      const c = client(); assert.equal((await c.login(subject)).status, 200); clients.set(subject, c);
    }
    const operator = clients.get("operator"), qc = clients.get("qc"), finance = clients.get("finance"), reviewer = clients.get("reviewer"), packer = clients.get("packer"), viewer = clients.get("viewer"), owner = clients.get("owner");
    await t.test("verified identity, origin, CSRF and unapproved subjects cannot elevate roles", async () => {
      const anonymous = client(); assert.equal((await anonymous.call("/v1/orders")).status, 401);
      assert.equal((await anonymous.login("unapproved")).status, 403);
      assert.equal((await anonymous.login("viewer", { aud: "TEST_ONLY_CUSTOMER_CLIENT" })).status, 401);
      assert.equal((await anonymous.login("viewer", { iss: "https://untrusted.invalid" })).status, 401);
      assert.equal((await anonymous.login("viewer", { exp: 1 })).status, 401);
      assert.equal((await operator.call("/v1/checkout-freeze", { reason: "TEST_ONLY count" }, { origin: "https://untrusted.invalid" })).status, 403);
      assert.equal((await operator.call("/v1/checkout-freeze", { reason: "TEST_ONLY count" }, { "x-yubie-csrf": "wrong" })).status, 403);
      assert.deepEqual((await viewer.call("/auth/session")).body.data.roles, ["viewer"]);
      assert.equal((await viewer.call("/v1/payments")).status, 403);
      assert.equal((await owner.call("/v1/payments")).status, 403, "Admin does not imply Finance");
    });
    await t.test("order filters and payment detail use real stored state with role-scoped customer fields", async () => {
      const response = await operator.call("/v1/orders?status=paid&search=TEST_ONLY_REF");
      assert.equal(response.status, 200); assert.equal(response.body.data.orders.length, 1);
      assert.equal((await operator.call("/v1/orders?status=cancelled")).body.data.orders.length, 0);
      assert.equal((await finance.call("/v1/payments?status=succeeded")).body.data.payments[0].amount, 35000);
      assert.equal((await viewer.call("/v1/orders/TEST_ONLY_ORDER")).body.data.piiAccess, false);
      assert.equal((await packer.call("/v1/orders/TEST_ONLY_ORDER")).body.data.piiAccess, true);
    });
    await t.test("count preview, independent QC approval, apply replay and discrepancy create one audited movement each", async () => {
      assert.equal((await operator.call("/v1/checkout-freeze", { reason: "TEST_ONLY physical count" })).status, 200);
      const intake = (quantity, expected, operationId) => { const now = new Date().toISOString(); return { documentType: "YUBIE_VERIFIED_INVENTORY_INTAKE_V1", purpose: "operational_count", sourceSha256: "a".repeat(64), verification: { status: "VERIFIED", evidenceRef: "TEST_ONLY_COUNT", verifiedBy: "operator", verifiedAt: now }, inventory: { operationId, actor: "operator", reason: "TEST_ONLY isolated count", countedAt: now, policies: [{ productId: "shake", sizeId: "sachet", version: 1, approvalRef: "TEST_ONLY_PACK", components: [{ productId: "shake", sizeId: "sachet", quantity: 1 }] }], lots: [{ productId: "shake", sizeId: "sachet", lotCode: "TEST_ONLY_LOT", unitOfMeasure: "sachet", expiryDate: "2100-01-01", countedUncommittedQuantity: quantity, expectedAvailable: expected, status: "released", qcApprovalRef: "TEST_ONLY_QC" }] } }; };
      for (const [quantity, expected, operationId] of [[2, 0, "TEST_ONLY_INITIAL"], [1, 2, "TEST_ONLY_DISCREPANCY"]]) {
        const payload = intake(quantity, expected, operationId);
        assert.equal((await operator.call("/v1/inventory/preview", payload)).status, 200);
        const created = await operator.call("/v1/requests", { kind: "inventory_count", payload }); assert.equal(created.status, 200);
        const id = created.body.data.id;
        assert.equal((await operator.call(`/v1/requests/${id}/approve`, { expectedVersion: 1, reason: "TEST_ONLY self approval" })).status, 403);
        assert.equal((await qc.call(`/v1/requests/${id}/approve`, { expectedVersion: 1, reason: "TEST_ONLY independent QC" })).status, 200);
        const headers = { "idempotency-key": operationId + "_APPLY" }, command = { expectedVersion: 2, reason: "TEST_ONLY approved count" };
        assert.equal((await operator.call(`/v1/requests/${id}/apply`, command, headers)).status, 200);
        assert.equal((await operator.call(`/v1/requests/${id}/apply`, command, headers)).status, 200);
      }
      assert.equal((await db.client`SELECT quantity_on_hand FROM inventory_lots`)[0].quantity_on_hand, 1);
      assert.equal((await operator.call("/v1/movements")).body.data.items.length, 2);
      const stock = await operator.call("/v1/stock"); assert.equal(stock.status, 200); assert.equal(stock.body.data.items.length, 9);
      const lots = await operator.call("/v1/inventory?status=released");
      assert.equal(lots.body.data.items[0].expiryDate, "2100-01-01");
      assert.equal(lots.body.data.items[0].availableQuantity, 1);
      assert.equal(lots.body.data.items[0].reservedQuantity, 0);
    });
    await t.test("paid fulfillment requires ordered stages, tracking and a fulfillment role", async () => {
      assert.equal((await viewer.call("/v1/orders/TEST_ONLY_ORDER/fulfillment", { expectedVersion: 0, stage: "packing", reason: "TEST_ONLY pack" })).status, 403);
      for (const [version, stage] of [[0, "packing"], [1, "packed"], [2, "shipped"], [3, "delivered"]]) {
        const result = await packer.call("/v1/orders/TEST_ONLY_ORDER/fulfillment", { expectedVersion: version, stage, reason: "TEST_ONLY fulfillment", ...(stage === "shipped" ? { carrier: "TEST_ONLY_CARRIER", trackingNumber: "TEST_ONLY_TRACKING" } : {}) });
        assert.equal(result.status, 200); assert.equal(result.body.data.stage, stage);
      }
      assert.equal((await operator.call("/v1/orders/TEST_ONLY_ORDER/notes", { body: "TEST_ONLY packing note", reason: "TEST_ONLY handoff" })).status, 200);
      assert.equal((await packer.call("/v1/orders/TEST_ONLY_ORDER")).body.data.fulfillment.tracking_number, "TEST_ONLY_TRACKING");
    });
    await t.test("Finance exception and reconciliation remain audited and never create a payment session", async () => {
      assert.equal((await operator.call("/v1/payments/TEST_ONLY_PAYMENT/reconcile", { reason: "TEST_ONLY verify" })).status, 403);
      const queued = await finance.call("/v1/payments/TEST_ONLY_PAYMENT/reconcile", { reason: "TEST_ONLY verify ledger" });
      assert.equal(queued.status, 200); assert.equal(queued.body.data.paymentSessionCreated, false);
      assert.equal((await finance.call("/v1/payments/TEST_ONLY_PAYMENT/triage", { expectedVersion: 0, state: "investigating", reason: "TEST_ONLY review" })).status, 200);
      assert.equal((await finance.call("/v1/cases")).body.data.items[0].version, 1);
      const payload = { orderId: "TEST_ONLY_ORDER", amount: 35000, reason: "TEST_ONLY full refund", evidenceRef: "TEST_ONLY_REFUND" };
      const draft = await finance.call("/v1/requests", { kind: "refund_full", payload }); assert.equal(draft.status, 200);
      const id = draft.body.data.id;
      assert.equal((await finance.call(`/v1/requests/${id}/approve`, { expectedVersion: 1, reason: "TEST_ONLY self review" })).status, 400);
      assert.equal((await reviewer.call(`/v1/requests/${id}/approve`, { expectedVersion: 1, reason: "TEST_ONLY independent Finance" })).status, 200);
      const applied = await finance.call(`/v1/requests/${id}/apply`, { expectedVersion: 2, reason: "TEST_ONLY merchant handoff" });
      assert.equal(applied.status, 200); assert.equal(applied.body.data.result.moneyMoved, false);
      assert.equal((await db.client`SELECT status FROM order_payments`)[0].status, "succeeded");
      assert.ok((await db.client`SELECT count(*)::int n FROM ops_events`)[0].n > 10);
      assert.equal((await db.client`SELECT count(*)::int n FROM outbox_events WHERE event_type='ops.payment_reconcile_requested'`)[0].n, 1);
    });
    await t.test("logout revocation rejects replay and database grant removal takes effect immediately", async () => {
      const replay = "yubie_ops=" + viewer.cookies.get("yubie_ops");
      assert.equal((await viewer.call("/auth/logout", {})).status, 200);
      assert.equal((await viewer.call("/auth/session", undefined, { cookie: replay })).status, 401);
      assert.equal((await owner.call("/v1/staff", { subject: "operator", role: "operator", action: "revoke", approvalRef: "TEST_ONLY_REVOKE", reason: "TEST_ONLY access removed" })).status, 200);
      assert.equal((await operator.call("/v1/orders")).status, 403);
      assert.equal((await db.client`SELECT count(*)::int n FROM admin_session_revocations`)[0].n, 1);
    });
    await t.test("consumed bootstrap never reopens after staff data is removed or approval identity changes", async () => {
      // Disaster-recovery fixture only: the production application has no DELETE grant.
      await db.client`DELETE FROM ops_staff_grants`;
      firstAdminApproval.approvalId = "TEST_ONLY_ANOTHER_APPROVAL";
      assert.equal((await notApproved.login("owner")).status, 403);
      assert.equal((await db.client`SELECT count(*)::int n FROM ops_staff_grants`)[0].n, 0);
      assert.equal((await db.client`SELECT count(*)::int n FROM ops_command_receipts WHERE idempotency_key='FIRST_ADMIN_BOOTSTRAP'`)[0].n, 1);
    });
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await closeDatabase(db); await admin`DROP DATABASE ${admin(name)} WITH (FORCE)`; await admin.end(); rmSync(directory, { recursive: true });
  }
});
