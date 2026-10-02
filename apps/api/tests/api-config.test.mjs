import assert from "node:assert/strict";
import test from "node:test";
import { createAppContext } from "../dist/composition/create-app.js";

const MANAGED_VARS = [
  "COMMERCE_PROVIDER",
  "PURCHASE_OPTIONS_SOURCE",
  "DATABASE_URL",
  "XENDIT_SECRET_KEY",
  "XENDIT_WEBHOOK_TOKEN",
  "XENDIT_BUSINESS_ID",
  "XENDIT_API_BASE_URL",
  "APP_ORIGIN",
  "GOOGLE_CLIENT_ID",
];

const ORIGINAL_ENV = Object.fromEntries(MANAGED_VARS.map((name) => [name, process.env[name]]));

function withEnv(overrides, run) {
  for (const name of MANAGED_VARS) delete process.env[name];
  // process.env stringifies assigned values, so undefined must delete.
  for (const [name, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  return run().finally(() => {
    for (const [name, value] of Object.entries(ORIGINAL_ENV)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
}

const XENDIT_ENV = {
  COMMERCE_PROVIDER: "xendit",
  PURCHASE_OPTIONS_SOURCE: "static",
  DATABASE_URL: "postgresql://yubie:yubie@127.0.0.1:5432/yubie_test_unused",
  XENDIT_SECRET_KEY: "xnd_test_secret",
  XENDIT_WEBHOOK_TOKEN: "callback-token",
  XENDIT_BUSINESS_ID: "biz-123",
  APP_ORIGIN: "https://yubie.id",
};

test("startup fails closed: xendit without DATABASE_URL is a CONFIG_ERROR", async () => {
  await withEnv({ ...XENDIT_ENV, DATABASE_URL: undefined, PURCHASE_OPTIONS_SOURCE: undefined }, async () => {
    assert.throws(() => createAppContext(), (error) => {
      assert.match(String(error), /CONFIG_ERROR/);
      assert.match(String(error), /DATABASE_URL/);
      return true;
    });
  });
});

test("startup fails closed: unknown COMMERCE_PROVIDER value never degrades to a fallback", async () => {
  await withEnv({ COMMERCE_PROVIDER: "xendti" }, async () => {
    assert.throws(() => createAppContext(), /COMMERCE_PROVIDER must be one of/);
  });
});

test("startup fails closed: missing webhook/business-id/https-origin are aggregated", async () => {
  await withEnv(
    {
      COMMERCE_PROVIDER: "xendit",
      DATABASE_URL: XENDIT_ENV.DATABASE_URL,
      XENDIT_SECRET_KEY: "xnd_test_secret",
      APP_ORIGIN: "http://yubie.id",
    },
    async () => {
      let message = "";
      try {
        createAppContext();
        assert.fail("expected CONFIG_ERROR");
      } catch (error) {
        message = String(error);
      }
      assert.match(message, /CONFIG_ERROR/);
      assert.ok(message.includes("XENDIT_WEBHOOK_TOKEN"));
      assert.ok(message.includes("XENDIT_BUSINESS_ID"));
      assert.ok(message.includes("https"));
    },
  );
});

test("default context uses a real clock and opaque ids, and reports preview commerce", async () => {
  await withEnv({}, async () => {
    const context = createAppContext();
    assert.equal(context.paymentMode, "preview");
    assert.equal(context.paymentProvider, null);

    // Production primitives: time advances and ids are opaque (not id-1/id-2).
    let advanced = false;
    for (let i = 0; i < 200 && !advanced; i += 1) {
      const before = context.clock.now();
      await new Promise((resolve) => setTimeout(resolve, 2));
      advanced = Date.parse(context.clock.now()) > Date.parse(before);
    }
    assert.ok(advanced, "production clock must advance");
    const first = context.ids.nextId();
    const second = context.ids.nextId();
    assert.notEqual(first, "id-1");
    assert.notEqual(first, second);
    assert.match(first, /^[0-9a-f-]{36}$/);

    const health = await context.healthProbe.check();
    assert.equal(health.ok, true);
    assert.equal(health.value.ready, true);
    assert.equal(health.value.details.commerceProvider, "preview");
    assert.equal(health.value.details.mode, "static");
  });
});

test("xendit mode keeps transactional state durable even when listings are static", async () => {
  await withEnv(XENDIT_ENV, async () => {
    const context = createAppContext();
    assert.equal(context.paymentMode, "xendit");
    assert.ok(context.paymentProvider, "xendit provider wired");
    // PURCHASE_OPTIONS_SOURCE=static governs listings only.
    assert.equal(context.listings.constructor.name, "InMemoryMarketplaceListingRepository");
    // Orders/payments/users/sessions are durable regardless of the listings flag.
    assert.equal(context.orders.constructor.name, "PostgresOrderRepository");
    assert.equal(context.payments.constructor.name, "PostgresPaymentRepository");
    assert.equal(context.paymentEvents.constructor.name, "PostgresPaymentEventRepository");
    assert.equal(context.users.constructor.name, "PostgresUserRepository");
    assert.equal(context.authSessions.constructor.name, "PostgresSessionRepository");
    assert.equal(context.webhookToken, "callback-token");
  });
});

test("readyz fails when the commerce config drifts after startup", async () => {
  await withEnv({}, async () => {
    const context = createAppContext();
    const healthy = await context.healthProbe.check();
    assert.equal(healthy.ok, true);
    assert.equal(healthy.value.ready, true);

    process.env.COMMERCE_PROVIDER = "bogus";
    const drifted = await context.healthProbe.check();
    // A config drift that would fail startup must also fail readiness — never
    // report ready from a fallback that cannot really serve.
    assert.equal(drifted.value.ready, false);
  });
});
