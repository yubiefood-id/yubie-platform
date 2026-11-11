import { expect, test } from "@playwright/test";
import {syntheticCommerceReads} from "../support/synthetic-commerce.js";

/**
 * Address search (Places autocomplete → details) and the logged-in prefill at
 * checkout. All location APIs are stubbed; no payment is ever submitted — the
 * Enter-key guard test pins that pressing Enter inside the search box picks a
 * suggestion instead of paying.
 */
const SUGGESTIONS = [
  { id: "place-1", label: "Jl. Raya Cibinong No. 1, Cibinong, Kabupaten Bogor, Jawa Barat" },
  { id: "place-2", label: "Jl. Raya Cibinong No. 20, Cibinong, Kabupaten Bogor, Jawa Barat" },
];
const DETAILS = {
  ok: true,
  data: {
    label: "Jl. Raya Cibinong No. 1, Cibinong, Kabupaten Bogor, Jawa Barat 16911",
    latitude: -6.4817,
    longitude: 106.8543,
    address: { province: "Jawa Barat", city: "Kabupaten Bogor", district: "Cibinong", postalCode: "16911" },
  },
};

test.beforeEach(async ({ page, context }) => {
  await syntheticCommerceReads(context);
  await page.addInitScript(() => sessionStorage.setItem("yubie.promo.dismissed.v1", "1"));
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { authenticated: false, csrfToken: "0".repeat(64), mapsAvailable: true } }) });
  });
  await page.route("**/api/shipping/coverage", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { policies: [{ policy: "free_promotional", amount: 0, cities: ["Kabupaten Bogor"] }] } }) });
  });
  await page.route("**/api/checkout/session", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { ready: true, admission: "enabled" } }) });
  });
  await page.route("**/api/checkout/quote", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { subtotalAmount: 9000, discountAmount: 0, shippingAmount: 0, totalAmount: 9000, currency: "IDR", stockAvailable: true, shippingAvailable: true } }) });
  });
});

async function openCheckout(page: import("@playwright/test").Page) {
  await page.goto("/products");
  await page.getByRole("button", { name: "Tambah", exact: true }).first().click();
  await page.goto("/checkout");
}

test("searching an address and picking a suggestion fills every delivery field", async ({ page }) => {
  await page.route("**/api/locations/autocomplete", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: SUGGESTIONS }) });
  });
  await page.route("**/api/locations/details", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(DETAILS) });
  });
  await openCheckout(page);

  const search = page.getByRole("textbox", { name: "Cari alamat pengiriman" });
  await search.fill("Jl. Raya Cibinong");
  await page.getByRole("listbox", { name: "Saran alamat" }).waitFor();
  await page.getByRole("option").first().click();

  await expect(page.getByRole("textbox", { name: "Alamat lengkap" })).toHaveValue(/Jl\. Raya Cibinong No\. 1/);
  await expect(page.getByRole("combobox", { name: "Kota", exact: true })).toHaveValue("Kabupaten Bogor");
  await expect(page.getByRole("textbox", { name: "Kode pos" })).toHaveValue("16911");
  await expect(page.getByText(/Alamat terpilih dari pencarian/)).toBeVisible();
  await expect(page.getByText(/🚚 Gratis ongkir — pengiriman ke Kabupaten Bogor gratis \(Rp0\)/)).toBeVisible();
});

test("Enter inside the search box picks a suggestion and never submits a payment", async ({ page }) => {
  let checkouts = 0;
  await page.route("**/api/checkout", async (route) => { checkouts++; await route.abort(); });
  await page.route("**/api/locations/autocomplete", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: SUGGESTIONS }) });
  });
  await page.route("**/api/locations/details", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(DETAILS) });
  });
  await openCheckout(page);
  // Make the form fully payable first so Enter WOULD pay without the guard.
  await page.getByLabel("Email").fill("search-enter@example.invalid");
  await page.getByLabel("No. WhatsApp").fill("080000000000");

  const search = page.getByRole("textbox", { name: "Cari alamat pengiriman" });
  await search.fill("Jl. Raya Cibinong");
  await page.getByRole("listbox", { name: "Saran alamat" }).waitFor();
  await search.press("Enter");

  await expect(page.getByRole("textbox", { name: "Alamat lengkap" })).toHaveValue(/Jl\. Raya Cibinong No\. 1/);
  expect(checkouts).toBe(0);
});

test("when the location service is inactive the search degrades honestly and manual entry stays", async ({ page }) => {
  await page.route("**/api/locations/autocomplete", async (route) => {
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, code: "LOCATION_UNAVAILABLE" }) });
  });
  await openCheckout(page);

  const search = page.getByRole("textbox", { name: "Cari alamat pengiriman" });
  await search.fill("Jl. Raya Cibinong");
  await expect(page.getByText("Layanan pencarian alamat belum aktif. Gunakan tombol lokasi di atas atau isi alamat manual.")).toBeVisible();
  await page.getByRole("textbox", { name: "Alamat lengkap" }).fill("Jl. Manual No. 9");
  await expect(page.getByRole("textbox", { name: "Alamat lengkap" })).toHaveValue("Jl. Manual No. 9");
});

test("a logged-in customer gets name and WhatsApp prefilled from the default saved address", async ({ page }) => {
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { authenticated: true, csrfToken: "0".repeat(64), mapsAvailable: true, user: { email: "saved@example.invalid" } } }) });
  });
  await page.route("**/api/account/addresses", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: [
      { id: "a2", isDefault: false, address: { recipientName: "Bukan Default", recipientPhone: "+6289999999999" } },
      { id: "a1", isDefault: true, address: { recipientName: "Penerima Utama", recipientPhone: "+6281234567890" } },
    ] }) });
  });
  await openCheckout(page);

  await expect(page.getByLabel("Nama penerima")).toHaveValue("Penerima Utama");
  await expect(page.getByLabel("No. WhatsApp")).toHaveValue("+6281234567890");
});

test("the account prefill never overwrites what the customer already typed", async ({ page }) => {
  let releaseAddresses: (() => void) | null = null;
  const gate = new Promise<void>((resolve) => { releaseAddresses = resolve; });
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { authenticated: true, csrfToken: "0".repeat(64), mapsAvailable: true } }) });
  });
  await page.route("**/api/account/addresses", async (route) => {
    await gate;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: [
      { id: "a1", isDefault: true, address: { recipientName: "Penerima Utama", recipientPhone: "+6281234567890" } },
    ] }) });
  });
  await openCheckout(page);
  await page.getByLabel("Nama penerima").fill("Nama Saya Sendiri");
  releaseAddresses!();

  await expect(page.getByLabel("No. WhatsApp")).toHaveValue("+6281234567890");
  await expect(page.getByLabel("Nama penerima")).toHaveValue("Nama Saya Sendiri");
});
