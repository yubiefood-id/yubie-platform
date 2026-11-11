import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest, setAppContext } from "../dist/index.js";
import { createAppContext } from "../dist/composition/create-app.js";

const ENV_NAMES = ["YUBIE_LAUNCH_PROFILE", "YUBIE_ENV", "COMMERCE_PROVIDER", "DATABASE_URL", "API_PROXY_TOKEN"];

const VALID_BODY = {
  name: "Budi Santoso",
  business: "Warung Budi",
  type: "Bakery",
  city: "Bandung",
  email: "budi@warung.id",
  whatsapp: "+62812345678",
  intent: "bulk",
  interest: "Yubie Flour",
  message: "Kami butuh pasokan bulanan.",
  consent: true,
};

async function withFreshContext(run) {
  const before = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));
  try {
    process.env.YUBIE_ENV = "test";
    process.env.COMMERCE_PROVIDER = "disabled";
    for (const name of ["DATABASE_URL", "API_PROXY_TOKEN"]) delete process.env[name];
    process.env.YUBIE_LAUNCH_PROFILE = "DIRECT_COMMERCE_PRODUCTION";
    setAppContext(createAppContext());
    await run();
  } finally {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

function post(body) {
  return handleRequest(new Request("https://api.yubiefood.com/v1/b2b-leads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

test("valid B2B submissions persist until the per-mailbox hourly budget is spent", async () => {
  await withFreshContext(async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await post({ ...VALID_BODY });
      assert.equal(response.status, 201, `attempt ${attempt}`);
      assert.equal((await response.json()).data.outcome, "created");
    }
    const blocked = await post({ ...VALID_BODY });
    assert.equal(blocked.status, 429);
    assert.equal((await blocked.json()).code, "RATE_LIMITED");
    assert.ok(Number(blocked.headers.get("retry-after")) > 0);
    // A different mailbox still has its own budget.
    const other = await post({ ...VALID_BODY, email: "other@bisnis.id" });
    assert.equal(other.status, 201);
  });
});

test("honeypot submissions get a quiet 201 without consuming the durable pipeline", async () => {
  await withFreshContext(async () => {
    const bot = await post({ ...VALID_BODY, website: "http://spam.example" });
    assert.equal(bot.status, 201);
    assert.equal((await bot.json()).data.outcome, "created");
    // The real mailbox budget is untouched: three genuine submits still pass.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await post({ ...VALID_BODY });
      assert.equal(response.status, 201, `genuine attempt ${attempt} must not be blocked by the honeypot hit`);
    }
    const blocked = await post({ ...VALID_BODY });
    assert.equal(blocked.status, 429);
  });
});

test("missing consent is rejected before any budget is spent", async () => {
  await withFreshContext(async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await post({ ...VALID_BODY, consent: false });
      assert.equal(response.status, 400);
    }
    const accepted = await post({ ...VALID_BODY });
    assert.equal(accepted.status, 201, "invalid requests must not consume the mailbox budget");
  });
});
