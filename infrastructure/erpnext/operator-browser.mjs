import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { localCredentials } from "./local-fixture-config.mjs";

const { users } = await localCredentials();
const browser = await chromium.launch();
let role = "setup";
try {
  for (role of ["operations", "warehouse", "manufacturing", "qa", "finance", "management"]) {
    const account = users[role];
    assert.equal(account.user, `${role}@yubie.test`);
    const context = await browser.newContext({ serviceWorkers: "block" });
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:8088/login");
    await page.locator("#login_email").fill(account.user);
    await page.locator("#login_password").fill(account.password);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.waitForURL(/\/(?:desk|app)(?:\/|$)/, { timeout: 45_000 });
    const identity = await page.evaluate(async () => {
      const response = await fetch("/api/method/frappe.auth.get_logged_user");
      return response.ok ? (await response.json()).message : null;
    });
    assert.equal(identity, account.user);
    console.log(JSON.stringify({ scope: "LOCAL_NATIVE_ERP_SYNTHETIC", role, login: "PASS" }));
    await context.close();
  }
} catch {
  // Playwright fill error call logs may contain the filled value. Never expose
  // the original error, traces, screenshots or cookies from credentialed tests.
  throw new Error(`ERP_LOCAL_BROWSER_FAILED: ${role}; credentials redacted`);
} finally { await browser.close(); }
