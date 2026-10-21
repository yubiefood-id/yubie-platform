import { test as base, expect } from "@playwright/test";
import { continueWithScopedAccess } from "./access-routing.js";
import { testEnvironment } from "./environment.js";

export const test = base.extend<{ safety: void }>({
  safety: [async ({ context }, use) => {
    const environment = testEnvironment();
    if (environment.remote) {
      // Service credentials are added only to the approved storefront origin,
      // never to Google, a payment host, or a redirect to another hostname.
      await context.route("**/*", async (route) => {
        const request = route.request();
        if (environment.tier === "production-smoke" && !["GET", "HEAD", "OPTIONS"].includes(request.method())) return route.abort("blockedbyclient");
        return continueWithScopedAccess(route, environment.baseURL, process.env.CF_ACCESS_CLIENT_ID, process.env.CF_ACCESS_CLIENT_SECRET);
      });
    } else {
      await context.route("**/api/auth/session", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: { "cache-control": "no-store" }, body: JSON.stringify({ ok: true, data: { authenticated: false, googleClientId: null } }) }));
      await context.route("**/api/checkout/session", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: { "cache-control": "no-store" }, body: JSON.stringify({ ok: true, data: { ready: true } }) }));
      await context.route("**/api/purchase-options/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { options: [] } }) }));
    }
    await use();
  }, { auto: true }],
});

export { expect };

export function assertAppOrigin(url: string) {
  const environment = testEnvironment();
  if (new URL(url).origin !== environment.baseURL) throw new Error("BLOCKED_ACCESS: approved storefront session required");
}
