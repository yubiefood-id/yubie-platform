import AxeBuilder from "@axe-core/playwright";
import { test, expect, assertAppOrigin } from "../support/fixtures.js";
import { testEnvironment } from "../support/environment.js";
import { variants, escapePattern } from "../support/catalog-variants.js";

const publicRoutes = ["/", "/products", "/our-story", "/our-roots", "/impact", "/b2b", "/faq", "/terms", "/privacy", "/products/yubie-flour", "/products/yubie-shake", "/products/yubie-ppang", "/products/yubie-mie"];

for (const path of publicRoutes) {
  test(`catalog route ${path} has honest content and no browser error`, async ({ page }) => {
    let errors = 0;
    page.on("pageerror", () => errors++);
    const response = await page.goto(path);
    assertAppOrigin(page.url());
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator('a[href^="mailto:hello@yubiefood.com"]').first()).toBeVisible();
    await expect(page.locator('a[href^="/checkout"], a[href^="/cart"], a[href^="/account"], a[href^="/login"], form')).toHaveCount(0);
    await expect(page.locator('meta[name="codex-preview"]')).toHaveCount(0);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /^https:\/\/yubiefood\.com(?:\/|$)/);
    expect(errors).toBe(0);
  });
}

for (const [productId, sizeId, label, price, sku] of variants) {
  test(`catalog variant ${productId}/${sizeId} selects its price and SKU without a cart`, async ({ page }) => {
    await page.goto(`/products/yubie-${productId}`);
    assertAppOrigin(page.url());
    const variant = page.getByRole("button", { name: new RegExp(escapePattern(label)) });
    await variant.click();
    await expect(variant).toHaveAttribute("aria-pressed", "true");
    await expect(variant).toContainText(price);
    await expect(page.locator(".buy-box")).toContainText(`SKU: ${sku}`);
    await expect(page.getByRole("button", { name: /Add to Cart|Tambah/i })).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("yubie.cart.v1"))).toBeNull();
  });
}

test("catalog dialogs contain keyboard focus and restore it after closing", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/");
  const menu = page.getByRole("button", { name: "Buka menu" });
  await menu.focus();
  await menu.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Menu utama" });
  await expect(dialog.getByRole("button", { name: "Tutup menu" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("link").last()).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Tutup menu" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 900 });
  const search = page.getByRole("button", { name: /Cari/ });
  await search.focus();
  await search.press("Enter");
  const searchDialog = page.getByRole("dialog", { name: "Cari sesuatu yang baik." });
  await expect(searchDialog.getByRole("textbox")).toBeFocused();
  await searchDialog.getByRole("link").last().focus();
  await page.keyboard.press("Tab");
  await expect(searchDialog.getByRole("button", { name: "Tutup pencarian" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(search).toBeFocused();
});

test("catalog navigation works through client transitions and browser history", async ({ page }) => {
  let errors = 0;
  page.on("pageerror", () => errors++);
  await page.goto("/");
  await page.getByRole("link", { name: /Lihat Katalog/ }).click();
  await expect(page).toHaveURL(/\/products$/);
  await page.getByRole("heading", { name: "Yubie Flour", exact: true }).getByRole("link").click();
  await expect(page).toHaveURL(/\/products\/yubie-flour$/);
  await page.getByRole("contentinfo").getByRole("link", { name: "B2B", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("BUILD YOUR NEXT PRODUCT");
  await expect(page.locator("main a[href='mailto:hello@yubiefood.com']")).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("YUBIE FLOUR");
  expect(errors).toBe(0);
});

test("catalog browsing makes no auth, checkout, listing or form API request", async ({ page }) => {
  let calls = 0;
  page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/")) calls++; });
  for (const path of ["/", "/products", "/products/yubie-flour", "/products/yubie-shake", "/b2b"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  expect(calls).toBe(0);
});

test("catalog deep links never imply a payment or account outcome", async ({ page }) => {
  for (const path of ["/cart", "/checkout", "/checkout/success?status=paid", "/checkout/cancel", "/login", "/account", "/account/orders", "/account/orders/synthetic-order"]) {
    await page.goto(path);
    assertAppOrigin(page.url());
    await expect(page.getByRole("heading", { name: "Transaksi langsung belum tersedia." })).toBeVisible();
    await expect(page.locator("form")).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  }
});

test("catalog API paths fail closed without cookies and real static SEO files are served", async ({ page }) => {
  await page.goto("/");
  assertAppOrigin(page.url());
  for (const path of ["/api/auth/session", "/api/checkout/session", "/api/checkout", "/api/newsletter", "/api/b2b", "/api/purchase-options/yubie-flour"]) {
    const result = await page.evaluate(async (path) => {
      const response = await fetch(path, { cache: "no-store" });
      return { status: response.status, cache: response.headers.get("cache-control"), body: await response.json() };
    }, path);
    expect(result.status).toBe(503);
    expect(result.cache).toContain("no-store");
    expect(result.body.code).toBe("FEATURE_DISABLED");
  }
  for (const path of ["/robots.txt", "/sitemap.xml"]) {
    const result = await page.evaluate(async (path) => { const response = await fetch(path); return { status: response.status, body: await response.text() }; }, path);
    expect(result.status).toBe(200);
    expect(result.body).toContain("https://yubiefood.com");
  }
  expect((await page.goto("/not-a-real-yubie-page"))?.status()).toBe(404);
});

test("catalog documents deliver CSP and other required security headers", async ({ page }) => {
  const response = await page.goto("/");
  assertAppOrigin(page.url());
  const headers = await response!.allHeaders();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["content-security-policy"]).toContain("sha256-");
  expect(headers["content-security-policy"].match(/script-src[^;]*/)?.[0]).not.toMatch(/unsafe-inline|unsafe-eval/);
  if (!["yubiefood.com", "www.yubiefood.com"].includes(new URL(testEnvironment().baseURL).hostname)) expect(headers["x-robots-tag"]).toContain("noindex");
});

for (const path of publicRoutes) {
  test(`catalog accessibility ${path} has no serious or critical violation`, async ({ page }) => {
    // Audit stable, fully visible content; normal-motion navigation is covered
    // separately. Reveal transitions otherwise change opacity during axe reads.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(path);
    assertAppOrigin(page.url());
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(result.violations.filter((row) => row.impact === "serious" || row.impact === "critical").map((row) => row.id)).toEqual([]);
  });
}

for (const width of [320, 375, 768]) {
  test(`catalog layout at ${width}px supports reduced motion across public routes`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const path of publicRoutes) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), path).toBe(true);
    }
  });
}
