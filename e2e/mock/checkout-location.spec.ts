import { expect, test } from "@playwright/test";
import {syntheticCommerceReads} from "../support/synthetic-commerce.js";

/**
 * Guest checkout location activation + free-shipping quick picks.
 * Everything Google is intercepted: geolocation via addInitScript, the
 * reverse-geocode proxy via route fulfillment, coverage via route fulfillment.
 * No real Maps credential ever enters the mock tier.
 */
const REVERSE_BODY = {
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
  await page.addInitScript(() => {
    Object.defineProperty(navigator.geolocation, "getCurrentPosition", {
      value: (success: PositionCallback) => success({ coords: { latitude: -6.4817, longitude: 106.8543, accuracy: 30, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() } as GeolocationPosition),
      configurable: true,
    });
  });
  await page.route("**/api/checkout/session", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { ready: true, admission: "enabled" } }) });
  });
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { authenticated: false, csrfToken: "0".repeat(64), mapsAvailable: true } }) });
  });
  await page.route("**/api/shipping/coverage", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { policies: [{ policy: "free_promotional", amount: 0, cities: ["Kabupaten Bogor"] }] } }) });
  });
  await page.route("**/api/locations/reverse-geocode", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(REVERSE_BODY) });
  });
  await page.route("**/api/checkout/quote", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { subtotalAmount: 9000, discountAmount: 0, shippingAmount: 0, totalAmount: 9000, currency: "IDR", stockAvailable: true, shippingAvailable: true } }) });
  });
});

test("activate location autofills the address and free-shipping city from the server preview", async ({ page }) => {
  await page.goto("/products");
  await page.getByRole("button", { name: "Tambah", exact: true }).first().click();
  await page.goto("/checkout");
  await page.getByLabel("Email").fill("browser-test@example.invalid");
  await page.getByLabel("No. WhatsApp").fill("080000000000");

  // The city is a dropdown of the server's covered cities, with the free-ongkir
  // instruction rendered directly under the field.
  await expect(page.getByRole("combobox", { name: "Kota", exact: true })).toContainText("Kabupaten Bogor");
  await expect(page.getByText(/Gratis ongkir \(Rp0\) saat ini tersedia untuk: Kabupaten Bogor/)).toBeVisible();
  await page.getByRole("button", { name: "📍 Aktifkan lokasi saya" }).click();

  await expect(page.getByRole("textbox", { name: "Alamat lengkap" })).toHaveValue(/Cibinong/);
  await expect(page.getByRole("combobox", { name: "Kota", exact: true })).toHaveValue("Kabupaten Bogor");
  await expect(page.getByRole("textbox", { name: "Kode pos" })).toHaveValue("16911");
  await expect(page.getByText(/Lokasi terdeteksi \(±30 m\)/)).toBeVisible();
  await expect(page.getByText(/Gratis ongkir ke Kabupaten Bogor/)).toBeVisible();
});

test("picking the covered city from the dropdown selects free shipping without geolocation", async ({ page }) => {
  await page.goto("/products");
  await page.getByRole("button", { name: "Tambah", exact: true }).first().click();
  await page.goto("/checkout");
  await page.getByRole("combobox", { name: "Kota", exact: true }).selectOption("Kabupaten Bogor");
  await expect(page.getByRole("combobox", { name: "Kota", exact: true })).toHaveValue("Kabupaten Bogor");
  await expect(page.getByText(/🚚 Gratis ongkir — pengiriman ke Kabupaten Bogor gratis \(Rp0\)/)).toBeVisible();
});
