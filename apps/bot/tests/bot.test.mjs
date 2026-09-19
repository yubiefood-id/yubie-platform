import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

test("healthz returns ok", async () => {
  const { handleRequest } = await import("../dist/index.js");
  const response = await handleRequest(new Request("http://localhost/healthz"));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.service, "yubie-bot");
});

test("webhook rejects missing signature", async () => {
  process.env.CHATWOOT_AGENTBOT_SECRET = "secret";
  const { handleRequest } = await import("../dist/index.js");
  const response = await handleRequest(
    new Request("http://localhost/webhooks/chatwoot-agentbot", {
      method: "POST",
      body: JSON.stringify({ event: "message_created" }),
    }),
  );
  assert.equal(response.status, 401);
});

test("webhook accepts signed payload when database configured", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL not set");
    return;
  }
  const secret = process.env.CHATWOOT_AGENTBOT_SECRET ?? "test-secret";
  process.env.CHATWOOT_AGENTBOT_SECRET = secret;
  const { handleRequest } = await import("../dist/index.js");
  const timestamp = String(Math.floor(Date.now() / 1000));
  const payload = JSON.stringify({
    event: "message_created",
    message_type: "incoming",
    id: 99,
    content: "halo",
    conversation: { id: 1, inbox_id: 2 },
    sender: { id: 3 },
  });
  const signature = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex")}`;
  const response = await handleRequest(
    new Request("http://localhost/webhooks/chatwoot-agentbot", {
      method: "POST",
      headers: {
        "x-chatwoot-signature": signature,
        "x-chatwoot-timestamp": timestamp,
        "x-chatwoot-delivery": `delivery-${Date.now()}`,
      },
      body: payload,
    }),
  );
  assert.equal(response.status, 202);
});
