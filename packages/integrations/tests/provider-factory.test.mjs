import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHandoffCommand,
  createSupportProvider,
  createZammadClient,
  FakeSupportProvider,
  FakeZammadClient,
  HttpZammadClient,
  resolveSupportProviderName,
  ZammadSupportProvider,
} from "../dist/index.js";

const VALID_STAGING_ZAMMAD_ENV = {
  YUBIE_ENV: "staging",
  SUPPORT_PROVIDER: "zammad",
  BOT_ENGINE: "deterministic",
  ZAMMAD_BASE_URL: "https://support-staging.example.com",
  ZAMMAD_API_TOKEN: "staging-token",
  ZAMMAD_WEBHOOK_SECRET: "staging-secret",
  ZAMMAD_WEBHOOK_BEARER: "staging-bearer",
  ZAMMAD_WHATSAPP_ARTICLE_TYPE: "whatsapp-message",
  ZAMMAD_GROUP_BOT_QUEUE: "10",
  ZAMMAD_GROUP_CUSTOMER_SUPPORT: "11",
  ZAMMAD_GROUP_SALES_PARTNERSHIP: "12",
  ZAMMAD_GROUP_FOOD_SAFETY: "13",
  ZAMMAD_PRIORITY_HIGH: "3",
};

function expectConfigError(fn) {
  try {
    fn();
  } catch (error) {
    assert.match(String(error.message), /^CONFIG_ERROR:/);
    return String(error.message);
  }
  assert.fail("expected CONFIG_ERROR");
}

test("development fake provider is explicitly allowed", () => {
  const support = createSupportProvider({ YUBIE_ENV: "development", SUPPORT_PROVIDER: "fake" });
  assert.ok(support instanceof FakeSupportProvider);
  assert.equal(support.provider, "fake");
});

test("staging zammad with full config builds real HTTP-backed provider", () => {
  const support = createSupportProvider(VALID_STAGING_ZAMMAD_ENV);
  assert.ok(support instanceof ZammadSupportProvider);
  assert.equal(support.provider, "zammad");
  // The provider must be backed by the HTTP client, never FakeZammadClient.
  const client = createZammadClient(VALID_STAGING_ZAMMAD_ENV);
  assert.ok(client instanceof HttpZammadClient);
  assert.ok(!(client instanceof FakeZammadClient));
});

test("staging zammad with missing token fails instead of FakeZammadClient", () => {
  const message = expectConfigError(() =>
    createSupportProvider({ ...VALID_STAGING_ZAMMAD_ENV, ZAMMAD_API_TOKEN: "" }),
  );
  assert.match(message, /ZAMMAD_API_TOKEN/);
});

test("production zammad with missing token fails", () => {
  const message = expectConfigError(() =>
    createSupportProvider({ ...VALID_STAGING_ZAMMAD_ENV, YUBIE_ENV: "production", ZAMMAD_API_TOKEN: "" }),
  );
  assert.match(message, /ZAMMAD_API_TOKEN/);
});

test("typo provider value fails instead of silently becoming fake", () => {
  assert.throws(() => resolveSupportProviderName({ SUPPORT_PROVIDER: "zamamd" }));
  const message = expectConfigError(() => createSupportProvider({ SUPPORT_PROVIDER: "zamamd" }));
  assert.match(message, /zamamd/);
});

test("resolveSupportProviderName without env resolves fake for development", () => {
  // Default (unset) resolves to fake — acceptable only because the implicit
  // environment is development; staging/production must set values explicitly.
  assert.equal(resolveSupportProviderName({}), "fake");
  assert.equal(resolveSupportProviderName({ SUPPORT_PROVIDER: "zammad", ...VALID_STAGING_ZAMMAD_ENV }), "zammad");
});

test("staging with missing food-safety group id fails handoff routing", () => {
  const message = expectConfigError(() =>
    buildHandoffCommand(
      { provider: "zammad", threadId: "1" },
      "FOOD_SAFETY",
      "food_safety",
      undefined,
      { ...VALID_STAGING_ZAMMAD_ENV, ZAMMAD_GROUP_FOOD_SAFETY: "" },
    ),
  );
  assert.match(message, /ZAMMAD_GROUP_FOOD_SAFETY/);
});

test("handoff uses configured staging group and priority ids", () => {
  const handoff = buildHandoffCommand(
    { provider: "zammad", threadId: "55" },
    "FOOD_SAFETY",
    "food_safety",
    undefined,
    VALID_STAGING_ZAMMAD_ENV,
  );
  assert.equal(handoff.groupId, "13");
  assert.equal(handoff.priorityId, "3");
  assert.equal(handoff.botModeOff, true);

  const sales = buildHandoffCommand(
    { provider: "zammad", threadId: "55" },
    "B2B_INTRO",
    "b2b",
    undefined,
    VALID_STAGING_ZAMMAD_ENV,
  );
  assert.equal(sales.groupId, "12");
});

test("explicit config group ids override environment ids", () => {
  const handoff = buildHandoffCommand(
    { provider: "zammad", threadId: "1" },
    "FOOD_SAFETY",
    "food_safety",
    { groupIds: { foodSafety: "99" }, priorityIds: { high: "7" } },
    VALID_STAGING_ZAMMAD_ENV,
  );
  assert.equal(handoff.groupId, "99");
  assert.equal(handoff.priorityId, "7");
});

test("outbound article uses the exact configured article type", async () => {
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
  const provider = new ZammadSupportProvider(client, "whatsapp-message");
  const result = await provider.sendReply({
    threadRef: { provider: "zammad", threadId: "1" },
    content: "Halo",
    idempotencyKey: "key-article-type",
  });
  assert.equal(result.ok, true);
  const created = [...client.articles.values()].at(-1);
  assert.equal(created.type, "whatsapp-message");
});
