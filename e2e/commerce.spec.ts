import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import {syntheticCommerceReads} from "./support/synthetic-commerce.js";

async function fillGuestCheckout(page: Page) {
  await page.getByLabel("Email").fill("browser-test@example.invalid");
  await page.getByLabel("No. WhatsApp").fill("080000000000");
  await page.getByLabel("Alamat lengkap").fill("Alamat pengujian lokal");
  await page.getByLabel("Kota").fill("Bogor");
}

async function openGuestCheckout(page: Page) {
  await page.goto("/products");
  await page.getByRole("button", { name: "Tambah", exact: true }).first().click();
  await page.goto("/checkout");
  await fillGuestCheckout(page);
}

test.beforeEach(async ({ page,context }) => {
  await syntheticCommerceReads(context);
  // Keep the always-on waitlist panel out of the checkout journey's way;
  // its own behaviour is pinned in e2e/mock/verified-promotion.spec.ts.
  await page.addInitScript(() => sessionStorage.setItem("yubie.promo.dismissed.v1", "1"));
  await page.route("**/api/promotions/welcome", route => route.fulfill({json:{ok:true,data:{available:false}}}));
  await page.route("**/api/checkout/session", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { ready: true,admission:"enabled" } }) });
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

test("guest bootstrap failure blocks checkout before any order submission", async ({ page }) => {
  let submissions = 0;
  await page.route("**/api/checkout/session", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false }) }));
  await page.route("**/api/checkout", (route) => {
    submissions++;
    return route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ ok: true, data: { status: "preview" } }) });
  });
  await page.goto("/products");
  await page.getByRole("button",{name:"Tambah",exact:true}).first().click();
  await page.goto("/checkout");
  await expect(page.getByText("Checkout belum tersedia.",{exact:true})).toBeVisible();
  await expect(page.getByLabel("Email")).toBeDisabled();
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
  await expect(page.getByText("Status pembayaran belum dapat dipastikan.",{exact:true})).toBeVisible();
  const held=await page.evaluate(()=>localStorage.getItem("yubie.checkout-attempt.v1"));
  await page.reload();
  await expect(page.getByText("Status pembayaran belum dapat dipastikan.",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Cek status",exact:true}).click();
  expect(keys).toHaveLength(1);
  expect(await page.evaluate(()=>localStorage.getItem("yubie.checkout-attempt.v1"))).toBe(held);
  const stored=await page.evaluate(()=>JSON.stringify(localStorage));
  expect(stored).not.toContain("browser-test@example.invalid");
  expect(stored).not.toContain("Alamat pengujian");
});

for (const path of ["/", "/products"]) {
  test(`${path} has no serious or critical automated accessibility violations`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const blocking = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
}

test("disabled checkout is unavailable rather than a pending payment",async({page})=>{
 await page.route("**/api/checkout",route=>route.fulfill({status:503,json:{ok:false,code:"CHECKOUT_DISABLED"}}));
 await openGuestCheckout(page);await page.getByRole("button",{name:/^Bayar/}).click();
 await expect(page.getByText("Checkout belum tersedia.",{exact:true})).toBeVisible();
 await expect(page.getByText("Status pembayaran belum dapat dipastikan.",{exact:true})).toHaveCount(0);
});
test("unverified stock cannot be added to a cart",async({page})=>{
 await page.route("**/api/catalog/availability",route=>route.fulfill({json:{ok:true,data:[]}}));
 await page.goto("/products");
 for(const button of await page.getByRole("button",{name:"Tambah",exact:true}).all())await expect(button).toBeDisabled();
 await expect(page.locator(".availability-chip").filter({hasText:"Stok belum terverifikasi"})).toHaveCount(4);
});
test("a cancel redirect retains a genuinely pending provider payment",async({page})=>{
 const token="a".repeat(32);
 await page.route("**/api/checkout/"+token,route=>route.fulfill({json:{ok:true,data:{checkoutToken:token,checkoutRef:"co_synthetic",orderStatus:"pending_payment",paymentStatus:"pending",totalAmount:35000,lines:[]}}}));
 await page.goto("/checkout/cancel?checkout="+token);
 await expect(page.getByText(/Status saat ini/)).toContainText("pending payment");
 await expect(page.getByRole("heading",{name:"Pembatalan terkonfirmasi."})).toHaveCount(0);
 await expect(page.locator("body")).not.toContainText("tidak ada dana yang terpotong");
});
test("two tabs cannot submit another payment while the first outcome is unknown",async({page,context})=>{
 let submissions=0;
 await context.route("**/api/checkout",async route=>{submissions++;await new Promise(resolve=>setTimeout(resolve,300));await route.fulfill({status:503,json:{ok:false,code:"PENDING_RECONCILIATION"}});});
 await openGuestCheckout(page);const second=await context.newPage();
 await second.goto("/checkout");await fillGuestCheckout(second);
 await Promise.all([page.getByRole("button",{name:/^Bayar/}).click(),second.getByRole("button",{name:/^Bayar/}).click()]);
 await expect(page.getByText("Status pembayaran belum dapat dipastikan.",{exact:true})).toBeVisible();
 await expect(second.getByText("Status pembayaran belum dapat dipastikan.",{exact:true})).toBeVisible();
 expect(submissions).toBe(1);await second.close();
});
