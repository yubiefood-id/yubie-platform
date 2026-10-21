import { test } from "../support/fixtures.js";

// The existing signed create probe is scripts/ipaymu-sandbox-probe.mjs.
// It proves CREATE_SESSION_PASS only. A browser storefront pass must never
// be interpreted as callback/refund/settlement acceptance. The provider's
// cancel/lookup/canonicalization contract and approved test method are still
// unavailable; fail the mandatory gate rather than omit or skip its cases.
test("provider callback, recovery, refund and settlement acceptance is mandatory", async () => {
  throw new Error("BLOCKED_PROVIDER_ACCEPTANCE: run the approved iPaymu contract matrix and attach provider-backed callback, recovery, refund and settlement evidence; a create probe is insufficient");
});
