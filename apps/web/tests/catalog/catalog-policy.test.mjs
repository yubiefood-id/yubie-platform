import assert from "node:assert/strict";
import test from "node:test";
import { validateCatalogListings } from "../../../../scripts/catalog-artifact.mjs";

test("marketplace release requires approved listings; catalog permits none", () => {
  const empty = { version: 1, listings: [] };
  assert.doesNotThrow(() => validateCatalogListings(empty, "PUBLIC_CATALOG_NO_SALES"));
  assert.throws(() => validateCatalogListings(empty, "MARKETPLACE_MSP"), /no approved listings/);
});

test("malformed listing destinations produce bounded errors without reflecting input", () => {
  const privateInput = "private operator token invalid url";
  assert.throws(() => validateCatalogListings({ version: 1, listings: [{ publicUrl: privateInput }] }, "MARKETPLACE_MSP"), (error) => {
    assert.equal(error.message, "CATALOG_CONFIG: invalid listing destination");
    assert.equal(JSON.stringify(error).includes(privateInput), false);
    return true;
  });
});
