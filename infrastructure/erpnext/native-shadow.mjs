import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "node:https";
import { randomUUID } from "node:crypto";
import { Agent } from "undici";
import { ErpNextShadowClient, ErpNextStockReader } from "@yubie/integrations";
import { runErpShadowReconcile } from "@yubie/application";
import { productFamilies } from "@yubie/domain";
import { createDatabase, closeDatabase, PostgresOutboxRepository } from "@yubie/persistence";
import { localCredentials } from "./local-fixture-config.mjs";

const { directory, users: { integration } } = await localCredentials();
if ((await stat(resolve(directory, "key.pem"))).mode & 0o077) throw new Error("ERP_LOCAL_CONFIG: TLS key must be private");
const cert = await readFile(resolve(directory, "cert.pem"));
const key = await readFile(resolve(directory, "key.pem"));
const agent = new Agent({ connect: { ca: cert } });
let reads = 0;
const proxy = createServer({ cert, key }, async (request, response) => {
  if (request.method !== "GET" || !request.url?.startsWith("/api/resource/")) { response.writeHead(405).end(); return; }
  reads++;
  try {
    const upstream = await fetch(`http://127.0.0.1:8088${request.url}`, { redirect: "error", headers: { Authorization: request.headers.authorization ?? "", Accept: "application/json" } });
    response.writeHead(upstream.status, { "Content-Type": "application/json" }).end(await upstream.text());
  } catch { response.writeHead(503).end(); }
});
await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
const database = createDatabase("postgresql://yubie:yubie_local@127.0.0.1:55432/yubie_test");
try {
  const client = new ErpNextShadowClient({ baseUrl: `https://127.0.0.1:${proxy.address().port}`, ...integration, fetchImpl: (url, options) => fetch(url, { ...options, dispatcher: agent }) });
  const reader = new ErpNextStockReader(client);
  assert.deepEqual(await reader.readReleasedStock(["YBF-250", "YBF-1000"], "Released - YTS"), { ok: true, value: [{ sku: "YBF-1000", quantity: 0 }] });
  const before = reads;
  assert.deepEqual(client.write(), { ok: false, code: "refused" });
  assert.equal(reads, before);
  const quarantine = await client.read(`/api/resource/Bin?${new URLSearchParams({ fields: JSON.stringify(["item_code", "actual_qty"]), filters: JSON.stringify([["warehouse", "=", "Quarantine - YTS"]]) })}`);
  assert.deepEqual(quarantine, { ok: true, value: { data: [] } });
  const denied = await fetch("http://127.0.0.1:8088/api/resource/Stock%20Entry", { method: "POST", redirect: "error", headers: { Authorization: `token ${integration.apiKey}:${integration.apiSecret}`, "Content-Type": "application/json" }, body: JSON.stringify({ company: "Yubie Synthetic Acceptance", stock_entry_type: "Material Receipt" }) });
  assert.equal(denied.status, 403);
  const mappings = productFamilies.flatMap((product) => product.sizes.map((size) => ({ productId: product.id, sizeId: size.id, erpItemCode: size.sku, warehouse: "Released - YTS" })));
  const runId = `native_${randomUUID()}`;
  const result = await runErpShadowReconcile({ mappings, erp: reader, yubie: { async readSellableStock() { return [{ productId: "flour", sizeId: "250g", quantity: 1 }]; } }, outbox: new PostgresOutboxRepository(database), attempt: 1, runId, now: new Date().toISOString() });
  assert.equal(result.status, "reported");
  assert.equal(result.mismatched, 1);
  const rows = await database.client`select count(*)::int as count from outbox_events where dedupe_key = ${`erp_shadow:${runId}:report`}`;
  assert.equal(rows[0].count, 1);
  console.log(JSON.stringify({ scope: "LOCAL_NATIVE_ERP_AND_POSTGRES", releasedStockRead: "PASS", quarantineExcluded: "PASS", apiWriteDenied: "PASS", durableDiscrepancy: "PASS", commerceStockWrites: "disabled", transport: "trusted local TLS proxy to loopback Frappe" }));
} catch {
  throw new Error("ERP_LOCAL_NATIVE_SHADOW_FAILED: inspect local fixture assertions; credentials redacted");
} finally {
  await closeDatabase(database);
  await agent.close();
  await new Promise((resolve) => proxy.close(resolve));
}
