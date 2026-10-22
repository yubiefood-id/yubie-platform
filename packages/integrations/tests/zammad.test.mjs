import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  buildHandoffCommand,
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

test("verifyZammadWebhook rejects missing auth config", () => {
  const result = verifyZammadWebhook({
    rawBody: Buffer.from("{}"),
    signature: null,
    secret: "",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "missing_auth_config");
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

test('Zammad article identity dedupes different provider delivery ids and payload encodings',()=>{
  const common={provider:'zammad',ticketId:'1',articleId:'2'};
  assert.equal(buildZammadDedupeKey({...common,deliveryId:'a',payloadHash:'a'}),buildZammadDedupeKey({...common,deliveryId:'b',payloadHash:'b'}));
});

test('real agent articles are distinct from the bot and an unowned open ticket does not imply a human owner',async()=>{
  const {mapArticle,isHumanActiveTicket}=await import('../dist/zammad/mapper.js');
  const article={id:1,body:'reply',content_type:'text/plain',internal:false,sender:'Agent',created_by_id:7,created_at:new Date().toISOString()};
  assert.equal(mapArticle(article,7).role,'bot');assert.equal(mapArticle({...article,created_by_id:8},7).role,'agent');
  assert.equal(isHumanActiveTicket({owner_id:1,state_id:2},[{id:2,name:'open',state_type_id:2}]),false);
});

test("buildHandoffCommand maps logical destinations to groups", () => {
  const ref = { provider: "zammad", threadId: "1" };
  const sales = buildHandoffCommand(ref, "B2B_INTRO", "b2b", { destination: "SALES_PARTNERSHIP" });
  assert.equal(sales.groupId, "3");
  assert.ok(sales.labels.includes("intent:b2b"));
  assert.ok(sales.labels.includes("bot:deterministic-v1"));
  const safety = buildHandoffCommand(ref, "FOOD_SAFETY", "food_safety", {
    destination: "FOOD_SAFETY",
    priorityIds: { high: "5" },
  });
  assert.equal(safety.groupId, "4");
  assert.equal(safety.priorityId, "5");
  assert.ok(safety.labels.includes("handoff:food-safety"));
  const cs = buildHandoffCommand(ref, "HUMAN_REQUEST", "human", { destination: "CUSTOMER_SUPPORT" });
  assert.equal(cs.groupId, "2");
  assert.ok(cs.labels.includes("handoff:human-request"));
  assert.ok(cs.labels.includes("channel:whatsapp"));
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
  client.articlesByTicket.set("1", [{id:0,ticket_id:1,sender:'Customer',type:'web',internal:false,body:'halo',created_at:new Date().toISOString()}]);
  const provider = new ZammadSupportProvider(client, "web");
  const result = await provider.sendReply({
    threadRef: { provider: "zammad", threadId: "1" },
    content: "Halo",
    idempotencyKey: "key-1",
  });
  assert.equal(result.ok, true);
  assert.equal(client.articles.size, 1);
});
