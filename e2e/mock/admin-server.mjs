// Synthetic identity/JWKS and readers only. This file is never included in
// the admin runtime artifact and is not staging/provider acceptance.
import { createServer } from "node:http";
import { generateKeyPairSync, sign } from "node:crypto";
import { resolve } from "node:path";
import { adminHttpHandler } from "../../apps/admin/dist/runtime.js";
import { GoogleIdTokenVerifier } from "@yubie/integrations";

const origin = "http://127.0.0.1:4174";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const clientId = "synthetic-staff-client";
const staffRoles = { sub_viewer: "viewer", sub_operator: "operator", sub_finance: "finance" };
const verifier = new GoogleIdTokenVerifier({ clientId, fetchFn: async () => ({ ok: true, json: async () => ({ keys: [{ ...publicKey.export({ format: "jwk" }), kid: "mock-key" }] }) }) });
const revoked = new Set();
const orders = Array.from({ length: 25 }, (_, index) => ({ id: `order_${String(index).padStart(2, "0")}`, checkoutRef: `co_mock_${index}`, status: "paid", amount: 29750, currency: "IDR" }));
const paginate = (items, query) => {
  const filtered = query.search ? items.filter((item) => item.id.includes(query.search)) : items;
  const start = Number(query.cursor || 0);
  return { items: filtered.slice(start, start + query.limit), nextCursor: start + query.limit < filtered.length ? String(start + query.limit) : null };
};
const handler = adminHttpHandler(() => ({
  sessionSecret: "synthetic-admin-session-secret-only-for-local-tests", nowMs: Date.now(),
  googleClientId: clientId, verifier, staffRoles,
  sessions: { async isRevoked(hash) { return revoked.has(hash); }, async revoke({ tokenHash }) { revoked.add(tokenHash); } },
  audit: { async append() { return { ok: true, value: undefined }; } },
  readers: {
    async listOrders(query) { return paginate(orders, query); },
    async listPayments(query) { return paginate([{ id: "payment_1", orderId: "order_01", status: "succeeded", amount: 29750, currency: "IDR", reconciliationState: "none" }], query); },
    async listExceptions(query) { return paginate([{ id: "payment_late", orderId: "order_02", status: "expired", amount: 35000, currency: "IDR", reconciliationState: "late_success_after_terminal" }], query); },
    async listInventory(query) { return paginate([{ id: "lot_released", productId: "flour", sizeId: "250g", quantity: 9, status: "released", expiryDate: "2027-06-30" }, { id: "lot_quarantined", productId: "flour", sizeId: "250g", quantity: 4, status: "quarantined", expiryDate: "2027-06-30" }], query); },
  },
}), origin, resolve("apps/admin/dist/public"));

const server = createServer((request, response) => {
  const url = new URL(request.url, origin);
  if (url.pathname === "/__test/credential") {
    const role = url.searchParams.get("role");
    if (!["viewer", "operator", "finance"].includes(role)) { response.writeHead(400); response.end(); return; }
    const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "mock-key" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ iss: "https://accounts.google.com", aud: clientId, sub: `sub_${role}`, exp: Math.floor(Date.now() / 1000) + 600, email_verified: true })).toString("base64url");
    const credential = `${header}.${payload}.${sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), privateKey).toString("base64url")}`;
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }); response.end(JSON.stringify({ credential })); return;
  }
  void handler(request, response);
});
server.listen(4174, "127.0.0.1");
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => server.close(() => process.exit(0)));
