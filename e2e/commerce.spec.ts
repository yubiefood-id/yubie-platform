import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function fillGuestCheckout(page: Page) {
  await page.getByLabel("Email").fill("browser-test@example.invalid");
  await page.getByLabel("No. WhatsApp").fill("080000000000");
  await page.getByLabel("Alamat lengkap").fill("Alamat pengujian lokal");
  await page.getByLabel("Kota").fill("Bogor");
}

async function openGuestCheckout(page: Page) {
  await page.goto("/products");
  await page.getByRole("button", { name: "Tutup promo", exact: true }).click();
  await page.getByRole("button", { name: "Tambah", exact: true }).first().click();
  await page.goto("/checkout");
  await fillGuestCheckout(page);
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/checkout/session", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { ready: true } }) });
  });
  await page.route("**/api/purchase-options/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { options: [] } }) });
  });
});

test("cart and guest checkout stay first-party and preview-only", async ({ page }) => {
  let checkoutBody: Record<string, unknown> | null = null;
  let idempotencyKey = "";
  await page.route("**/api/checkout", async (route) => {
    const request = route.request();
    checkoutBody = request.postDataJSON() as Record<string, unknown> | null;
    idempotencyKey = request.headers()["idempotency-key"] ?? "";
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: { status: "preview", checkoutRef: "co_e2e", totalAmount: 35_000 } }),
    });
  });

  await page.goto("/products");
  await page.getByRole("button", { name: "Tutup promo", exact: true }).click();
  await page.getByRole("button", { name: "Tambah", exact: true }).first().click();
  await expect.poll(async () => {
    const cart = await page.evaluate(() => localStorage.getItem("yubie.cart.v1"));
    if (!cart) return 0;
    try {
      return (JSON.parse(cart) as unknown[]).length;
    } catch {
      return 0;
    }
  }).toBe(1);
  await page.goto("/cart");
  await expect(page.getByRole("heading", { name: "Keranjang" })).toBeVisible();
  await page.getByRole("link", { name: /Lanjut ke Checkout/ }).click();

  await page.getByLabel("Email").fill("browser-test@example.invalid");
  await page.getByLabel("No. WhatsApp").fill("080000000000");
  await page.getByLabel("Alamat lengkap").fill("Alamat pengujian lokal");
  await page.getByLabel("Kota").fill("Bogor");
  await page.getByRole("button", { name: /^Bayar/ }).click();

  await expect(page.getByText("Mode pembayaran demo sedang aktif.")).toBeVisible();
  expect(idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  expect(checkoutBody).not.toHaveProperty("amount");
  expect(checkoutBody).not.toHaveProperty("unitPrice");
  expect(checkoutBody).toHaveProperty("lines");
});

test("login fails safely when staff has not configured Google locally", async ({ page }) => {
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ ok: false, code: "UNAUTHORIZED" }) });
  });
  await page.route("**/api/auth/config", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { googleClientId: null } }) });
  });
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /Selamat datang/ })).toBeVisible();
  await expect(page.getByText("Sign-in Google sedang disiapkan.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Lanjut belanja/ })).toBeVisible();
});

test("guest bootstrap failure blocks checkout before any order submission", async ({ page }) => {
  let submissions = 0;
  await page.route("**/api/checkout/session", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false }) }));
  await page.route("**/api/checkout", (route) => {
    submissions++;
    return route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ ok: true, data: { status: "preview" } }) });
  });
  await openGuestCheckout(page);
  await page.getByRole("button", { name: /^Bayar/ }).click();
  await expect(page.getByRole("alert")).toContainText(/sesi checkout/i);
  expect(submissions).toBe(0);
});

test("an ambiguous checkout survives reload with the same attempt key and no stored personal data", async ({ page }) => {
  const keys: string[] = [];
  await page.route("**/api/checkout", (route) => {
    keys.push(route.request().headers()["idempotency-key"] ?? "");
    if (keys.length === 1) return route.abort("connectionfailed");
    return route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ ok: true, data: { status: "preview" } }) });
  });
  await openGuestCheckout(page);
  await page.getByRole("button", { name: /^Bayar/ }).click();
  await expect(page.getByText("Pembayaran Anda sedang kami pastikan.")).toBeVisible();
  await page.reload();
  await fillGuestCheckout(page);
  await page.getByRole("button", { name: /^Bayar/ }).click();
  await expect(page.getByText("Mode pembayaran demo sedang aktif.")).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[1]).toBe(keys[0]);
  const stored = await page.evaluate(() => JSON.stringify(sessionStorage));
  expect(stored).not.toContain("browser-test@example.invalid");
  expect(stored).not.toContain("Alamat pengujian");
});

for (const path of ["/", "/products"]) {
  test(`${path} has no serious or critical automated accessibility violations`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "Tutup promo", exact: true }).click();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const blocking = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
}
