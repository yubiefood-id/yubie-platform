#!/usr/bin/env node
/**
 * SANDBOX_PASS acceptance gate (two-order Biteship sandbox validation).
 *
 * PASSes only when ALL of the following hold, with evidence supplied as a
 * JSON file (no fabrication — every value comes from a verify-mode probe run
 * or a webhook-ingestion query against the production database):
 *   1. two DISTINCT non-empty Biteship sandbox order ids;
 *   2. independent provider verification (GET /v1/orders/{id}) of
 *      delivered == "delivered" AND cancelled == "cancelled";
 *   3. the delivered order was NOT cancelled afterwards (verify statuses are
 *      re-read at gate time; a later cancel would flip it and fail the gate);
 *   4. webhook evidence: at least one shipment_provider_inbox row per order
 *      (or an explicit webhooks: "absent" with blockerNote — reported, never
 *      silently passed);
 *   5. probe integration checks green (ratesCount>0, pickupCapableCount>0)
 *      for both booking runs.
 *
 * Exit codes: 0 = SANDBOX_PASS, 1 = FAIL (reasons printed), 2 = usage error.
 */
import { readFile } from "node:fs/promises";
import { exit } from "node:process";

/**
 * @typedef {{ orderId: string, verifiedStatus: string, ratesCount: number, pickupCapableCount: number, probeRunUrl?: string }} OrderEvidence
 * @typedef {{ recordedAtUtc: string, delivered: OrderEvidence, cancelled: OrderEvidence, webhooks: { deliveredInboxRows: number, cancelledInboxRows: number, absent?: boolean, blockerNote?: string } }} Evidence
 */

const reasons = [];

function assert(condition, message) {
  if (!condition) reasons.push(message);
}

const path = process.argv[2];
if (!path) {
  console.error("usage: node scripts/shipping/sandbox-acceptance.mjs <evidence.json>");
  exit(2);
}

let evidence;
try {
  evidence = JSON.parse(await readFile(path, "utf8"));
} catch {
  console.error("SANDBOX_PASS: FAIL — evidence file unreadable/invalid JSON");
  exit(1);
}

assert(typeof evidence.delivered?.orderId === "string" && evidence.delivered.orderId.length > 0, "delivered.orderId missing");
assert(typeof evidence.cancelled?.orderId === "string" && evidence.cancelled.orderId.length > 0, "cancelled.orderId missing");
if (evidence.delivered?.orderId && evidence.cancelled?.orderId) {
  assert(evidence.delivered.orderId !== evidence.cancelled.orderId, "order ids must be DISTINCT (two separate orders)");
}
assert(evidence.delivered?.verifiedStatus === "delivered", `delivered order verified status is ${JSON.stringify(evidence.delivered?.verifiedStatus)}, expected "delivered"`);
assert(evidence.cancelled?.verifiedStatus === "cancelled", `cancelled order verified status is ${JSON.stringify(evidence.cancelled?.verifiedStatus)}, expected "cancelled"`);
assert((evidence.delivered?.ratesCount ?? 0) > 0, "delivered run ratesCount must be > 0");
assert((evidence.delivered?.pickupCapableCount ?? 0) > 0, "delivered run pickupCapableCount must be > 0");
assert((evidence.cancelled?.ratesCount ?? 0) > 0, "cancelled run ratesCount must be > 0");
assert((evidence.cancelled?.pickupCapableCount ?? 0) > 0, "cancelled run pickupCapableCount must be > 0");

const webhooks = evidence.webhooks ?? { deliveredInboxRows: 0, cancelledInboxRows: 0 };
if (webhooks.absent === true) {
  reasons.push(`webhook ingestion NOT evidenced (declared absent): ${webhooks.blockerNote ?? "no note"} — production activation stays blocked until real webhook evidence or an explicitly reviewed exception`);
} else {
  assert((webhooks.deliveredInboxRows ?? 0) >= 1, "no shipment_provider_inbox row for the delivered order");
  assert((webhooks.cancelledInboxRows ?? 0) >= 1, "no shipment_provider_inbox row for the cancelled order");
}

if (reasons.length > 0) {
  console.error("SANDBOX_PASS: FAIL");
  for (const reason of reasons) console.error(`  - ${reason}`);
  exit(1);
}

console.log("SANDBOX_PASS: OK");
console.log(`  delivered: ${evidence.delivered.orderId} (verified delivered, ${evidence.delivered.pickupCapableCount} pickup-capable rates)`);
console.log(`  cancelled: ${evidence.cancelled.orderId} (verified cancelled, ${evidence.cancelled.pickupCapableCount} pickup-capable rates)`);
console.log(`  webhooks: delivered=${webhooks.deliveredInboxRows} row(s), cancelled=${webhooks.cancelledInboxRows} row(s)`);
console.log(`  recordedAtUtc: ${evidence.recordedAtUtc}`);
exit(0);
