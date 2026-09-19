import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  buildZammadDedupeKey,
  FakeZammadClient,
  parseZammadTriggerPayload,
  verifyZammadWebhook,
  ZammadSupportProvider,
} from "../dist/index.js";

test("verifyZammadWebhook accepts valid HMAC-SHA1 signature", () => {
  const secret = "zammad-secret";
  const body = Buffer.from(JSON.stringify({ ticket_id: 1, article_id: 2 }));
  const signature = createHmac("sha1", secret).update(body).digest("hex");
  const result = verifyZammadWebhook({
    rawBody: body,
    signature: `sha1=${signature}`,
    secret,
  });
  assert.equal(result.ok, true);
});

test("verifyZammadWebhook rejects invalid signature", () => {
  const result = verifyZammadWebhook({
    rawBody: Buffer.from("{}"),
    signature: "sha1=deadbeef",
    secret: "zammad-secret",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "invalid_signature");
});

test("verifyZammadWebhook validates bearer token when configured", () => {
  const body = Buffer.from("{}");
  const okResult = verifyZammadWebhook({
    rawBody: body,
    signature: null,
    secret: "",
    bearerToken: "token-123",
    authorizationHeader: "Bearer token-123",
  });
  assert.equal(okResult.ok, true);

  const badResult = verifyZammadWebhook({
    rawBody: body,
    signature: null,
    secret: "",
    bearerToken: "token-123",
    authorizationHeader: "Bearer wrong",
  });
  assert.equal(badResult.ok, false);
});

test("parseZammadTriggerPayload extracts ticket and article refs", () => {
  const parsed = parseZammadTriggerPayload({
    event: "article_created",
    ticket_id: 10,
    article_id: 20,
    customer_id: 30,
    group_id: 40,
  });
  assert.equal(parsed?.ticketId, "10");
  assert.equal(parsed?.articleId, "20");
});

test("buildZammadDedupeKey prefers delivery id", () => {
  const key = buildZammadDedupeKey({
    deliveryId: "delivery-1",
    provider: "zammad",
    payloadHash: "abc",
  });
  assert.equal(key, "delivery-1");
});

test("ZammadSupportProvider sends reply via fake client", async () => {
  const client = new FakeZammadClient();
  client.tickets.set("1", {
    id: 1,
    number: "10001",
    title: "Test",
    group_id: 1,
    state_id: 1,
    priority_id: 2,
    owner_id: 0,
    customer_id: 5,
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  });
  const provider = new ZammadSupportProvider(client, "web");
  const result = await provider.sendReply({
    threadRef: { provider: "zammad", threadId: "1" },
    content: "Halo",
    idempotencyKey: "key-1",
  });
  assert.equal(result.ok, true);
  assert.equal(client.articles.size, 1);
});
