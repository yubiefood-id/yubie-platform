import assert from "node:assert/strict";
import test from "node:test";
import { customerRouteEnabled, isDirectCommerceProfile, parseLaunchProfile } from "../dist/index.js";

test("unset launch profile fails closed to the public catalog", () => {
  assert.equal(parseLaunchProfile(undefined), "PUBLIC_CATALOG_NO_SALES");
  assert.equal(parseLaunchProfile(""), "PUBLIC_CATALOG_NO_SALES");
});

test("every approved profile parses and typos fail loudly", () => {
  for (const profile of ["PUBLIC_CATALOG_NO_SALES", "MARKETPLACE_MSP", "DIRECT_COMMERCE_SANDBOX", "DIRECT_COMMERCE_PRODUCTION"]) {
    assert.equal(parseLaunchProfile(profile), profile);
  }
  assert.throws(() => parseLaunchProfile("direct_commerce_production"), /approved launch profile/);
  assert.throws(() => parseLaunchProfile("DIRECT_COMMERCE"), /approved launch profile/);
});

test("direct commerce profiles expose customer routes; catalog profiles keep them closed", () => {
  for (const profile of ["DIRECT_COMMERCE_SANDBOX", "DIRECT_COMMERCE_PRODUCTION"]) {
    assert.equal(isDirectCommerceProfile(profile), true);
    for (const route of [
      "/v1/auth/session",
      "/v1/account/addresses",
      "/v1/checkouts",
      "/v1/locations/search",
      "/v1/promotions/welcome",
      "/v1/newsletter",
      "/v1/products/yubie-flour/purchase-options",
      "/go/shopee/launch",
      "/v1/catalog",
    ]) {
      assert.equal(customerRouteEnabled(profile, route), true, `${profile} ${route}`);
    }
  }
  assert.equal(isDirectCommerceProfile("PUBLIC_CATALOG_NO_SALES"), false);
  assert.equal(isDirectCommerceProfile("MARKETPLACE_MSP"), false);
  for (const route of ["/v1/auth/session", "/v1/checkouts", "/v1/account/addresses", "/v1/newsletter"]) {
    assert.equal(customerRouteEnabled("PUBLIC_CATALOG_NO_SALES", route), false, route);
    assert.equal(customerRouteEnabled("MARKETPLACE_MSP", route), false, route);
  }
  // Catalog profiles keep public catalog + marketplace routes open.
  assert.equal(customerRouteEnabled("PUBLIC_CATALOG_NO_SALES", "/v1/catalog"), true);
  assert.equal(customerRouteEnabled("MARKETPLACE_MSP", "/go/shopee/launch"), true);
  assert.equal(customerRouteEnabled("MARKETPLACE_MSP", "/v1/products/yubie-flour/purchase-options"), true);
  assert.equal(customerRouteEnabled("PUBLIC_CATALOG_NO_SALES", "/v1/products/yubie-flour/purchase-options"), false);
});
