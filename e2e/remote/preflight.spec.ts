import { test, expect, assertAppOrigin } from "../support/fixtures.js";
import { testEnvironment } from "../support/environment.js";

test("approved staging access reaches the actual application", async ({ page }) => {
  await page.goto("/");
  assertAppOrigin(page.url());
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("deployed identity and launch scope match the reviewed release", async ({ page, request }) => {
  const environment = testEnvironment();
  if (environment.catalog) {
    await page.goto("/");
    assertAppOrigin(page.url());
    const result = await page.evaluate(async () => {
      const response = await fetch("/release-manifest.json", { cache: "no-store" });
      return { status: response.status, identity: response.ok ? await response.json() : null };
    });
    if (result.status !== 200 || result.identity?.sourceSha !== environment.expectedSha || result.identity?.artifactDigest !== environment.expectedDigest || result.identity?.sourceDirty !== false) throw new Error("BLOCKED_RELEASE_DRIFT: deploy the reviewed immutable catalog before acceptance");
    expect(result.identity.launchProfile).toBe(environment.launchProfile);
    expect(result.identity.paymentMode).toBe("disabled");
    return;
  }
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
