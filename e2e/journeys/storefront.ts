import AxeBuilder from "@axe-core/playwright";
import { test, expect, assertAppOrigin } from "../support/fixtures.js";
import { testEnvironment } from "../support/environment.js";

const publicRoutes = ["/", "/products", "/shop", "/our-story", "/our-roots", "/recipes", "/b2b", "/faq", "/impact", "/terms", "/privacy", "/cart", "/login"];
for (const path of publicRoutes) {
  test(`public route ${path} renders without a browser exception`, async ({ page }) => {
    let errors = 0;
    page.on("pageerror", () => errors++);
    const response = await page.goto(path);
    assertAppOrigin(page.url());
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(errors).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}

// Literal, hand-checked catalog baseline, independent of the code computing
// prices. This is software parity evidence, not finance/label approval.
const variants = [
  ["flour", "250g", "250 g", "35.000"], ["flour", "1kg", "1 kg", "120.000"],
  ["shake", "sachet", "1 sachet · 45 g", "19.500"], ["shake", "pack-7", "Pack · 7 sachet", "129.000"],
  ["ppang", "mini", "1 Mini Ppang · 35 g", "9.000"], ["ppang", "maxi", "1 Maxi Ppang", "19.000"], ["ppang", "mini-pack-5", "Pack · 5 Mini Ppang", "42.000"],
  ["mie", "single", "1 bungkus · 75 g", "16.000"], ["mie", "pack-3", "Pack · 3 bungkus", "45.000"],
] as const;
const escapePattern = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
for (const [productId, sizeId, label, price] of variants) {
  test(`variant ${productId}/${sizeId} keeps its price and selection through cart refresh`, async ({ page }) => {
    const response = await page.goto(`/products/yubie-${productId}`);
    expect(response?.status()).toBe(200);
    assertAppOrigin(page.url());
    const variant = page.getByRole("button", { name: new RegExp(escapePattern(label)) });
    await variant.click();
    await expect(variant).toHaveAttribute("aria-pressed", "true");
    await expect(variant).toContainText(price);
    await page.getByRole("button", { name: /^Add to Cart/ }).click();
    await expect.poll(() => page.evaluate(({ productId, sizeId }) => {
      const lines = JSON.parse(localStorage.getItem("yubie.cart.v1") || "[]") as Array<{ productId: string; sizeId: string; quantity: number }>;
      return lines.some((line) => line.productId === productId && line.sizeId === sizeId && line.quantity === 1);
    }, { productId, sizeId })).toBe(true);
    await page.goto("/cart");
    await page.reload();
    const items = page.getByRole("region", { name: "Item keranjang" });
    await expect(items).toContainText(label);
    await expect(items).toContainText(price);
  });
}

for (const path of ["/", "/products", "/products/yubie-flour", "/products/yubie-shake", "/products/yubie-ppang", "/products/yubie-mie", "/cart", "/login"]) {
  test(`accessibility ${path} has no serious or critical automated violation`, async ({ page }) => {
    await page.goto(path);
    assertAppOrigin(page.url());
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    // Do not put DOM or customer content into the failure/report.
    expect(result.violations.filter((row) => row.impact === "serious" || row.impact === "critical").map((row) => row.id)).toEqual([]);
  });
}

for (const width of [320, 768]) {
  test(`layout at ${width}px remains usable with reduced motion`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const path of ["/", "/products", "/products/yubie-flour"]) {
      await page.goto(path);
      assertAppOrigin(page.url());
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
  });
}

test("robots, sitemap and missing routes are real HTTP responses", async ({ page }) => {
  await page.goto("/");
  assertAppOrigin(page.url());
  for (const path of ["/robots.txt", "/sitemap.xml"]) {
    const result = await page.evaluate(async (path) => {
      const response = await fetch(path, { cache: "no-store" });
      return { status: response.status, contentType: response.headers.get("content-type"), cacheControl: response.headers.get("cache-control") };
    }, path);
    expect(result.status, path).toBe(200);
  }
  const missing = await page.goto("/not-a-real-yubie-page");
  expect(missing?.status()).toBe(404);
});

if (testEnvironment().remote) test("same-origin customer and guest-session endpoints reach the real backend", async ({ page }) => {
  await page.goto("/");
  assertAppOrigin(page.url());
  for (const path of ["/api/auth/session", "/api/checkout/session"]) {
    const result = await page.evaluate(async (path) => {
      const response = await fetch(path, { cache: "no-store" });
      return { status: response.status, contentType: response.headers.get("content-type"), cacheControl: response.headers.get("cache-control"), requestId: response.headers.get("x-request-id") };
    }, path);
    expect(result.status).toBe(200);
    expect(result.contentType).toContain("application/json");
    expect(result.cacheControl).toContain("no-store");
    expect(result.requestId).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  }
});
