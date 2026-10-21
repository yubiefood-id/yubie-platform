import { test, expect, assertAppOrigin } from "../support/fixtures.js";
import { testEnvironment } from "../support/environment.js";

test("approved staging access reaches the actual application", async ({ page }) => {
  await page.goto("/");
  assertAppOrigin(page.url());
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("deployed API identity and commerce mode match the reviewed release", async ({ request }) => {
  const environment = testEnvironment();
  const health = await request.get(`${environment.apiURL}/healthz`, { maxRedirects: 0 })
    .catch(() => { throw new Error("BLOCKED_NETWORK: API health request could not complete"); });
  if (!health.ok()) throw new Error("BLOCKED_ACCESS: API health is unavailable");
  const identity = await health.json();
  if (identity.releaseSha !== environment.expectedSha) throw new Error("BLOCKED_RELEASE_DRIFT: deploy the reviewed immutable artifacts before transactional tests");
  const ready = await request.get(`${environment.apiURL}/readyz`, { maxRedirects: 0 });
  expect(ready.status()).toBe(200);
  const details = (await ready.json()).details;
  expect(details?.database).toBe("connected");
  expect(details?.commerceProvider).toBe(environment.tier === "sandbox" ? "ipaymu" : "preview");
});
