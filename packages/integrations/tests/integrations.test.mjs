import assert from "node:assert/strict";
import test from "node:test";
import { DefaultRedirectAllowlistPolicy } from "../dist/index.js";

test("allowlist accepts known shopee host", () => {
  const policy = new DefaultRedirectAllowlistPolicy();
  assert.equal(policy.isAllowedUrl("https://shopee.co.id/product/123", "shopee"), true);
  assert.equal(policy.isAllowedUrl("http://shopee.co.id/product/123", "shopee"), false);
  assert.equal(policy.isAllowedUrl("https://evil.shopee.co.id/product/123", "shopee"), false);
});

test("allowlist rejects arbitrary host", () => {
  const policy = new DefaultRedirectAllowlistPolicy();
  assert.equal(policy.isAllowedUrl("https://evil.com/phish", "shopee"), false);
});
