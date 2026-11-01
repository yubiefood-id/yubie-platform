import { expect, test } from "@playwright/test";
import {syntheticCommerceReads} from "../support/synthetic-commerce.js";

/**
 * Checkout must stay FILLABLE on real phones even when the checkout-session
 * probe fails. Production incident 2026-10-31: every input sat inside
 * fieldsets gated on admission, and the admission chain permanently resolved
 * "unavailable" on Safari/iOS < 16.4 (no navigator.locks / AbortSignal.timeout),
 * with blocked storage, or on a transient /api/checkout/session failure over
 * cellular — a frozen form that looked identical to an enabled one. These
 * tests pin the regression: typing is never gated on admission; only the pay
 * button is. No payment is ever submitted here.
 */

test.beforeEach(async ({ page, context }) => {
  await syntheticCommerceReads(context);
  await page.addInitScript(() => sessionStorage.setItem("yubie.promo.dismissed.v1", "1"));
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { authenticated: false, csrfToken: "0".repeat(64), mapsAvailable: true } }) });
  });
  await page.route("**/api/shipping/coverage", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { policies: [{ policy: "free_promotional", amount: 0, cities: ["Kabupaten Bogor"] }] } }) });
  });
  await page.route("**/api/checkout/quote", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { subtotalAmount: 9000, discountAmount: 0, shippingAmount: 0, totalAmount: 9000, currency: "IDR", stockAvailable: true, shippingAvailable: true } }) });
  });
});

test("inputs stay fillable when the checkout session probe fails", async ({ page }) => {
  await page.route("**/api/checkout/session", async (route) => {
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ ok: false }) });
  });
  await page.goto("/products");
  await page.getByRole("button", { name: "Tambah", exact: true }).first().click();
  await page.goto("/checkout");

  await expect(page.getByText("Checkout belum tersedia.")).toBeVisible();
  await page.getByLabel("Email").fill("mobile-user@example.invalid");
  await page.getByLabel("No. WhatsApp").fill("080000000000");
  await page.getByLabel("Alamat lengkap").fill("Jl. Raya Cibinong No. 1");
  await page.getByRole("combobox", { name: "Kota", exact: true }).fill("Kabupaten Bogor");
  await expect(page.getByLabel("Email")).toHaveValue("mobile-user@example.invalid");
  await expect(page.getByRole("combobox", { name: "Kota", exact: true })).toHaveValue("Kabupaten Bogor");
  await expect(page.getByText(/Gratis ongkir ke Kabupaten Bogor/)).toBeVisible();
  // The pay button — not the fields — carries the admission gate.
  const pay = page.getByRole("button", { name: /^Bayar/ });
  await expect(pay).toBeDisabled();
});

test("legacy mobile browsers (no Web Locks, no AbortSignal.timeout) can complete the form", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "locks", { get: () => undefined, configurable: true });
    Object.defineProperty(AbortSignal, "timeout", { value: undefined, configurable: true });
  });
  await page.route("**/api/checkout/session", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { ready: true, admission: "enabled" } }) });
  });
  await page.goto("/products");
  await page.getByRole("button", { name: "Tambah", exact: true }).first().click();
  await page.goto("/checkout");

  await page.getByLabel("Email").fill("legacy-ios@example.invalid");
  await page.getByLabel("No. WhatsApp").fill("080000000000");
  await page.getByLabel("Alamat lengkap").fill("Jl. Raya Cibinong No. 1");
  await page.getByRole("button", { name: /Gratis ongkir — Kabupaten Bogor/ }).click();
  await expect(page.getByRole("combobox", { name: "Kota", exact: true })).toHaveValue("Kabupaten Bogor");
  await expect(page.getByText(/Gratis ongkir ke Kabupaten Bogor/)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Bayar Rp/ })).toBeEnabled();
  // The fallback timer must not abort the settled session/quote requests.
  await expect(page.getByText("Checkout belum tersedia.")).toHaveCount(0);
});
