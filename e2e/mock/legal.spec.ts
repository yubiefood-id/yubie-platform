import { expect, test } from "@playwright/test";
import {syntheticCommerceReads} from "../support/synthetic-commerce.js";

/**
 * Merchant-verification legal surfaces in the direct-commerce build: the four
 * iPaymu-required pages render publicly, the footer carries every legal link,
 * and checkout shows the consent sentence with policy links before paying.
 * Checkout APIs are stubbed the same way as checkout-location.spec.ts; no
 * payment is ever created.
 */
test.beforeEach(async ({ page, context }) => {
  await syntheticCommerceReads(context);
  await page.addInitScript(() => sessionStorage.setItem("yubie.promo.dismissed.v1", "1"));
  await page.route("**/api/checkout/session", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { ready: true, admission: "enabled" } }) });
  });
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

test("the four iPaymu-required pages render publicly in the commerce build", async ({ page }) => {
  await page.goto("/faq");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.locator("details", { hasText: "Metode pembayaran apa saja yang tersedia?" }).locator("summary").click();
  await expect(page.getByText(/iPaymu/).first()).toBeVisible();

  await page.goto("/terms");
  await expect(page.getByRole("heading", { name: /Syarat & Ketentuan Yubie/ })).toBeVisible();
  await expect(page.getByText(/Berlaku efektif sejak/)).toBeVisible();

  await page.goto("/refund-policy");
  await expect(page.getByRole("heading", { name: /Kebijakan Pengembalian Dana dan Pembatalan/ })).toBeVisible();
  await expect(page.getByText(/\[REFUND YUBIE\] - Nomor Pesanan/).first()).toBeVisible();

  await page.goto("/contact");
  await expect(page.getByRole("heading", { name: /Hubungi Yubie/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /hello@yubiefood\.com/ }).first()).toBeVisible();
});

test("footer exposes every mandatory legal link on the commerce storefront", async ({ page }) => {
  await page.goto("/");
  const footer = page.locator("footer");
  for (const [name, href] of [
    ["FAQ", "/faq"],
    ["Hubungi Kami", "/contact"],
    [/Syarat & Ketentuan/, "/terms"],
    [/Kebijakan Pengembalian Dana/, "/refund-policy"],
    [/Kebijakan Privasi/, "/privacy"],
  ] as const) {
    await expect(footer.getByRole("link", { name }).first()).toHaveAttribute("href", href);
  }
  await expect(footer.getByRole("link", { name: /hello@yubiefood\.com/ }).first()).toBeVisible();
});

test("checkout shows the consent sentence with policy links before paying", async ({ page }) => {
  await page.goto("/products");
  await page.getByRole("button", { name: "Tambah", exact: true }).first().click();
  await page.goto("/checkout");
  const consent = page.getByText("Dengan melanjutkan pemesanan");
  await expect(consent).toBeVisible();
  await expect(consent.getByRole("link", { name: /Syarat & Ketentuan Yubie/ })).toHaveAttribute("href", "/terms");
  await expect(consent.getByRole("link", { name: /Kebijakan Privasi/ })).toHaveAttribute("href", "/privacy");
  await expect(consent.getByRole("link", { name: /Kebijakan Pengembalian Dana/ })).toHaveAttribute("href", "/refund-policy");
});
