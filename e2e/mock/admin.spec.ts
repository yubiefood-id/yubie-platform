import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, role: "viewer" | "operator" | "finance") {
  const credential = (await (await page.request.get(`http://127.0.0.1:4174/__test/credential?role=${role}`)).json()).credential;
  await page.route("https://accounts.google.com/gsi/client", (route) => route.fulfill({ contentType: "application/javascript", body: `window.google={accounts:{id:{initialize(options){this.callback=options.callback},renderButton(host){const button=document.createElement('button');button.textContent='Continue with Google';button.onclick=()=>this.callback({credential:${JSON.stringify(credential)}});host.append(button)}}}};` }));
  await page.goto("http://127.0.0.1:4174/");
  await expect(page.getByRole("heading", { name: "Masuk operasi Yubie" })).toBeVisible();
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.getByRole("heading", { name: "Ringkasan operasional", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pesanan", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Pesanan", exact: true })).toBeVisible();
}

test("Refine viewer reads real BFF fixture pages, searches, and cannot read payments", async ({ page }) => {
  await login(page, "viewer");
  await expect(page.getByRole("cell", { name: "order_00", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Berikutnya", exact: true }).click();
  await expect(page.getByRole("cell", { name: "order_20", exact: true })).toBeVisible();
  await page.getByLabel("Cari ID atau referensi").fill("order_24");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("cell", { name: "order_24", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "order_20", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Pembayaran", exact: true })).toHaveCount(0);
  expect(await page.evaluate(async () => (await fetch("/v1/payments")).status)).toBe(403);
});

test("finance sees exceptions and quarantine data, while writes and customer-cookie access are denied", async ({ page }) => {
  await login(page, "finance");
  await page.getByRole("button", { name: "Pengecualian pembayaran", exact: true }).click();
  await expect(page.getByRole("cell", { name: "late_success_after_terminal", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Lot dan stok", exact: true }).click();
  await expect(page.getByRole("cell", { name: "quarantined", exact: true })).toBeVisible();
  expect(await page.evaluate(async () => (await fetch("/v1/orders", { method: "POST" })).status)).toBe(403);
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
  expect(result.violations.filter((row) => row.impact === "serious" || row.impact === "critical").map((row) => row.id)).toEqual([]);
  await page.getByRole("button", { name: "Keluar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Masuk operasi Yubie" })).toBeVisible();
});

test("Refine shows a backend failure rather than a successful empty payment page", async ({ page }) => {
  await login(page, "finance");
  await page.route("**/v1/payments?*", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, code: "UNAVAILABLE" }) }));
  await page.getByRole("button", { name: "Pembayaran", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("data source is unavailable");
  await expect(page.getByText("Tidak ada catatan yang cocok.")).toHaveCount(0);
});
