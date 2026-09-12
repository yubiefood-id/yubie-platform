import assert from "node:assert/strict";
import test from "node:test";
import { calculateSubtotal, filterRecipes, productClaims, productRootOfferings, rootVarieties } from "../dist/index.js";

test("calculateSubtotal totals Indonesian rupiah line items", () => {
  assert.equal(calculateSubtotal([
    { id: "flour-250g", productId: "flour", name: "Yubie Flour", sizeId: "250g", sizeLabel: "250 g", quantity: 2, unitPrice: 15000, image: "/flour.webp" },
    { id: "flour-500g", productId: "flour", name: "Yubie Flour", sizeId: "500g", sizeLabel: "500 g", quantity: 1, unitPrice: 28000, image: "/flour.webp" },
  ]), 58000);
});

test("canonical root discovery contains five reusable varieties", () => {
  assert.deepEqual(rootVarieties.map((root) => root.id), ["ubi-ungu", "ubi-madu", "ubi-oranye", "ubi-merah", "ubi-jepang"]);
});

test("only an explicitly available root offering can expose commerce sizes", () => {
  const available = productRootOfferings.filter((offering) => offering.status === "available");
  assert.deepEqual(available.map((offering) => offering.id), ["flour-ubi-ungu"]);
  assert.ok(available[0].sizeIds.length > 0);
  assert.ok(productRootOfferings.filter((offering) => offering.status !== "available").every((offering) => offering.sizeIds.length === 0));
});

test("pending root claims remain private", () => {
  const rootClaims = productClaims.filter((claim) => claim.scopeType === "root");
  assert.ok(rootClaims.length > 0);
  assert.ok(rootClaims.every((claim) => claim.approvalStatus === "pending" && claim.publicVisibility === false));
});

test("recipe filters connect product and root relationships", () => {
  assert.deepEqual(filterRecipes("flour", "ubi-madu").map((recipe) => recipe.id), ["soft-cookies"]);
  assert.deepEqual(filterRecipes("shake", "ubi-ungu").map((recipe) => recipe.id), ["creamy-bowl"]);
});
