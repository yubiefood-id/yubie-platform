import { test, expect } from "../support/fixtures.js";

test("cart cannot accept a click before its persisted state has hydrated", async ({ page }) => {
  // A slow/failed JavaScript download must not expose an apparently working
  // add action that is silently discarded by the later storage hydration.
  await page.route("**/*.js", (route) => route.abort());
  await page.goto("/products/yubie-ppang");
  await expect(page.getByRole("button", { name: /^Add to Cart/ })).toBeDisabled();
});
