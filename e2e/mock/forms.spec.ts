import { test, expect } from "../support/fixtures.js";

test("newsletter failure preserves consent and input and permits retry", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/newsletter", (route) => route.fulfill({ status: ++attempts === 1 ? 503 : 200, contentType: "application/json", body: JSON.stringify({ ok: attempts > 1 }) }));
  await page.goto("/");
  const form = page.locator(".newsletter-form");
  // During hydration the SSR form and the hydrated client form can coexist
  // for a moment; a strict-mode fill in that window resolves to 2 elements
  // (observed mobile-chromium, run 40060240923). Wait until exactly ONE form
  // exists — this keeps the single-form invariant asserted (a persistent
  // duplicate still fails) while removing the hydration race.
  await expect(form).toHaveCount(1);
  await form.getByLabel("Email", { exact: true }).fill("synthetic@example.test");
  await form.getByRole("checkbox").check();
  await form.getByRole("button").click();
  await expect(form.getByRole("alert")).toBeVisible();
  await expect(form.getByLabel("Email", { exact: true })).toHaveValue("synthetic@example.test");
  await expect(form.getByRole("checkbox")).toBeChecked();
  await form.getByRole("button").click();
  await expect(page.getByRole("status").filter({ hasText: "Welcome to the roots" })).toBeVisible();
});

test("B2B transport failure keeps the enquiry and consent available for retry", async ({ page }) => {
  await page.route("**/api/b2b", (route) => route.abort("connectionfailed"));
  await page.goto("/b2b");
  const form = page.locator(".b2b-form");
  // Same hydration race as the newsletter spec (PR #38): CI run 40065971653
  // failed BOTH chromium projects with getByLabel('Nama', {exact:true})
  // resolving to 2 inputs — the error names two distinct input[name=name]
  // elements, one inside a second form wrapper, i.e. the SSR form and the
  // hydrated client form coexisted (the B2B form mounts through Suspense +
  // useSearchParams, adding a remount path). 'Nama' vs 'Nama bisnis' cannot
  // collide under exact:true, so two matches can only be two form instances.
  // 20/20 local executions pass (faster hardware narrows the window), which
  // is why the guard waits for exactly ONE form instead of trusting timing:
  // a persistent duplicate still fails the count assertion.
  await expect(form).toHaveCount(1);
  await form.getByLabel("Nama", { exact: true }).fill("Synthetic QA");
  await form.getByLabel("Nama bisnis").fill("Synthetic Bakery");
  await form.getByLabel("Jenis bisnis").selectOption({ label: "Bakery" });
  await form.getByLabel("Kota").fill("Bogor");
  await form.getByLabel("Email", { exact: true }).fill("synthetic@example.test");
  await form.getByLabel("WhatsApp", { exact: true }).fill("080000000000");
  await form.getByLabel("Produk yang diminati").selectOption({ label: "Yubie Flour" });
  await form.getByRole("checkbox").check();
  await form.getByRole("button").click();
  await expect(form.getByRole("alert")).toBeVisible();
  await expect(form.getByLabel("Nama bisnis")).toHaveValue("Synthetic Bakery");
  await expect(form.getByRole("checkbox")).toBeChecked();
});
