import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

test("verifyChatwootWebhook accepts valid signature", async () => {
  const { verifyChatwootWebhook } = await import("../dist/index.js");
  const secret = "test-secret";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const rawBody = Buffer.from(JSON.stringify({ event: "message_created" }));
  const signature = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${rawBody.toString("utf8")}`).digest("hex")}`;
  const result = verifyChatwootWebhook({ rawBody, signature, timestamp, secret });
  assert.equal(result.ok, true);
});

test("verifyChatwootWebhook rejects stale timestamp", async () => {
  const { verifyChatwootWebhook } = await import("../dist/index.js");
  const secret = "test-secret";
  const timestamp = "1";
  const rawBody = Buffer.from("{}");
  const signature = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${rawBody.toString("utf8")}`).digest("hex")}`;
  const result = verifyChatwootWebhook({ rawBody, signature, timestamp, secret, nowSec: 999999 });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "stale_timestamp");
});
