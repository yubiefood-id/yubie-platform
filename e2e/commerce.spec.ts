import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

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

for (const path of ["/", "/products"]) {
  test(`${path} has no serious or critical automated accessibility violations`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const blocking = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
}
