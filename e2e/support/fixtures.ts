import { test as base, expect } from "@playwright/test";
import { continueWithScopedAccess } from "./access-routing.js";
import { testEnvironment } from "./environment.js";
import {syntheticCommerceReads} from "./synthetic-commerce.js";
import { observePublicSmoke } from "./p0-diagnostics.js";
import { dismissPromotionForOrigin } from "./public-storage.js";

export const test = base.extend<{ safety: void }>({
  safety: [async ({ context }, use, info) => {
    const finishDiagnostics = observePublicSmoke(context, info);
    const environment = testEnvironment();
    if (environment.remote) {
      // Service credentials are added only to the approved storefront origin,
      // never to Google, a payment host, or a redirect to another hostname.
      await context.route("**/*", async (route) => {
        const request = route.request();
        if (environment.tier === "production-smoke" && !["GET", "HEAD", "OPTIONS"].includes(request.method())) return route.abort("blockedbyclient");
        return continueWithScopedAccess(route, environment.baseURL, process.env.CF_ACCESS_CLIENT_ID, process.env.CF_ACCESS_CLIENT_SECRET);
      });
    } else if (environment.tier === "mock") {
      await syntheticCommerceReads(context);
      // The mock tier bakes a synthetic Maps key; never let the real Google
      // script load anyway — an auth-failing-but-loaded JsAPI makes
      // AdvancedMarkerElement crash nondeterministically. Blocking the domain
      // keeps DeliveryMap on its deterministic "Peta belum dapat dimuat"
      // fallback in every test.
      await context.route(/^(https?:\/\/)?([a-z0-9-]+\.)*maps\.googleapis\.com\/.*$/, route => route.abort("blockedbyclient"));
      await context.route(/^(https?:\/\/)?([a-z0-9-]+\.)*(gstatic|googleapis)\.com\/.*(maps|mapsapi).*/, route => route.abort("blockedbyclient"));
      await context.route("**/api/promotions/welcome", route => route.fulfill({json:{ok:true,data:{available:false}}}));
      await context.route("**/api/auth/session", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: { "cache-control": "no-store" }, body: JSON.stringify({ ok: true, data: { authenticated: false, googleClientId: null } }) }));
      await context.route("**/api/purchase-options/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { options: [] } }) }));
    }
    // The always-on waitlist panel is exercised directly in
    // mock/verified-promotion.spec; everywhere else it would only sit in the
    // way of clicks, so dismiss it for the session (inert in the catalog tier
    // where the widgets never mount).
    await context.addInitScript(dismissPromotionForOrigin, environment.baseURL);
    await use();
    finishDiagnostics();
  }, { auto: true }],
});

export { expect };

export function assertAppOrigin(url: string) {
  const environment = testEnvironment();
  if (new URL(url).origin !== environment.baseURL) throw new Error("BLOCKED_ACCESS: approved storefront session required");
}
