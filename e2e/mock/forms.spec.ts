import { test, expect } from "../support/fixtures.js";

test("newsletter failure preserves consent and input and permits retry", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/newsletter", (route) => route.fulfill({ status: ++attempts === 1 ? 503 : 200, contentType: "application/json", body: JSON.stringify({ ok: attempts > 1 }) }));
  await page.goto("/");
  await page.getByRole("button", { name: "Tutup promo", exact: true }).click();
  const form = page.locator(".newsletter-form");
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
  await page.getByRole("button", { name: "Tutup promo", exact: true }).click();
  const form = page.locator(".b2b-form");
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
