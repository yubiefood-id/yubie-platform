import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest, setAppContext } from "../dist/index.js";
import { createAppContext } from "../dist/composition/create-app.js";

const NAMES = ["YUBIE_LAUNCH_PROFILE", "YUBIE_ENV", "COMMERCE_PROVIDER", "DATABASE_URL", "API_PROXY_TOKEN", "YUBIE_CHECKOUT_ADMISSION"];

async function postCheckout() {
  return handleRequest(new Request("https://api.yubiefood.com/v1/checkouts", {
    method: "POST",
    body: JSON.stringify({ lines: [{ productId: "yubie-flour", sizeId: "250g", quantity: 1 }], customerEmail: "synthetic@example.test" }),
    headers: { "content-type": "application/json" },
  }));
}

test("checkout admission freeze stops new sessions but not recovery reads", async () => {
  const before = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]));
  try {
    for (const name of NAMES) delete process.env[name];
    process.env.YUBIE_ENV = "test";
    process.env.COMMERCE_PROVIDER = "preview";
    process.env.YUBIE_LAUNCH_PROFILE = "DIRECT_COMMERCE_SANDBOX";
    setAppContext(createAppContext());

    // Frozen: every new payable session attempt is refused before any work.
    process.env.YUBIE_CHECKOUT_ADMISSION = "disabled";
    const frozen = await postCheckout();
    assert.equal(frozen.status, 503);
    assert.equal((await frozen.json()).code, "CHECKOUT_DISABLED");
    assert.equal(frozen.headers.get("cache-control"), "no-store");

    // Recovery stays available: session issuance and status reads are not gated.
    const session = await handleRequest(new Request("https://api.yubiefood.com/v1/checkouts/session"));
    assert.notEqual((await session.json()).code, "FEATURE_DISABLED");

    // Unfrozen: the gate opens and validation proceeds (valid line reaches the
    // preview path, not CHECKOUT_DISABLED).
    process.env.YUBIE_CHECKOUT_ADMISSION = "enabled";
    const open = await postCheckout();
    const body = await open.json();
    assert.notEqual(body.code, "CHECKOUT_DISABLED");
    assert.notEqual(open.status, 503);
  } finally {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
