import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { after } from "node:test";
import test from "node:test";

after(async () => {
  const { shutdownBotRuntime } = await import("../dist/index.js");
  await shutdownBotRuntime();
});

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
    id: randomUUID(),
    content: "halo",
    conversation: { id: randomUUID(), inbox_id: 2 },
    sender: { id: 3 },
  });
  const signature = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex")}`;
  const response = await handleRequest(
    new Request("http://localhost/webhooks/chatwoot-agentbot", {
      method: "POST",
      headers: {
        "x-chatwoot-signature": signature,
        "x-chatwoot-timestamp": timestamp,
        "x-chatwoot-delivery": randomUUID(),
      },
      body: payload,
    }),
  );
  assert.equal(response.status, 202);
});

test("zammad webhook rejects invalid signature", async () => {
  process.env.ZAMMAD_WEBHOOK_SECRET = "zammad-secret";
  const { handleRequest } = await import("../dist/index.js");
  const response = await handleRequest(
    new Request("http://localhost/webhooks/zammad", {
      method: "POST",
      headers: { "x-hub-signature": "sha1=invalid" },
      body: JSON.stringify({ ticket_id: 1, article_id: 2 }),
    }),
  );
  assert.equal(response.status, 401);
});

test("zammad webhook accepts signed payload when database configured", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL not set");
    return;
  }
  const secret = process.env.ZAMMAD_WEBHOOK_SECRET ?? "zammad-secret";
  process.env.ZAMMAD_WEBHOOK_SECRET = secret;
  const { handleRequest } = await import("../dist/index.js");
  const payload = JSON.stringify({
    event: "article_created",
    ticket_id: 10,
    article_id: randomUUID(),
    customer_id: 30,
    group_id: 40,
  });
  const signature = `sha1=${createHmac("sha1", secret).update(payload).digest("hex")}`;
  const response = await handleRequest(
    new Request("http://localhost/webhooks/zammad", {
      method: "POST",
      headers: {
        "x-hub-signature": signature,
        "x-zammad-delivery": randomUUID(),
      },
      body: payload,
    }),
  );
  assert.equal(response.status, 202);
});
