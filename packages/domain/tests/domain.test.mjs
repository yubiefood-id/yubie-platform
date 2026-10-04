import assert from "node:assert/strict";
import test from "node:test";
import { calculateSubtotal, filterRecipes, productClaims, productFamilies, productRootOfferings, quotePromotion, removeCartLine, rootVarieties, upsertCartLine } from "../dist/index.js";

test("calculateSubtotal totals Indonesian rupiah line items", () => {
  assert.equal(calculateSubtotal([
    { id: "flour-250g", productId: "flour", name: "Yubie Flour", sizeId: "250g", sizeLabel: "250 g", quantity: 2, unitPrice: 15000, image: "/flour.webp" },
    { id: "flour-500g", productId: "flour", name: "Yubie Flour", sizeId: "500g", sizeLabel: "500 g", quantity: 1, unitPrice: 28000, image: "/flour.webp" },
  ]), 58000);
});

test("launch promotion is case-insensitive and server-calculated", () => {
  assert.deepEqual(quotePromotion("yubie15", 129000), { code: "YUBIE15", percentage: 15, discountAmount: 19350 });
  assert.equal(quotePromotion("other", 129000), null);
  assert.equal(quotePromotion("YUBIE15", 0), null);
});

test("catalog lists four commercially available families with approved variants", () => {
  assert.deepEqual(productFamilies.map((product) => product.id), ["flour", "shake", "ppang", "mie"]);
  const available = productFamilies.filter((product) => product.status === "available");
  assert.deepEqual(available.map((product) => product.id), ["flour", "shake", "ppang", "mie"]);
  const mie = productFamilies.find((product) => product.id === "mie");
  assert.equal(mie.status, "available");
  assert.equal(mie.verificationStatus, "verified");
  assert.deepEqual(mie.sizes.map((size) => size.price), [16000, 45000]);
  assert.equal(productRootOfferings.some((offering) => offering.productId === "mie" && offering.status === "available"), true);
});

test("cart line helpers merge, clamp, and remove without duplicating lines", () => {
  let lines = upsertCartLine([], "flour", "250g", 1);
  lines = upsertCartLine(lines, "flour", "250g", 2);
  lines = upsertCartLine(lines, "flour", "1kg", 1);
  assert.deepEqual(lines, [
    { productId: "flour", sizeId: "250g", quantity: 2 },
    { productId: "flour", sizeId: "1kg", quantity: 1 },
  ]);
  assert.equal(upsertCartLine(lines, "flour", "250g", 99)[0].quantity, 20);
  assert.deepEqual(upsertCartLine(lines, "flour", "250g", 0), lines.slice(1));
  assert.deepEqual(removeCartLine(lines, "flour", "1kg"), lines.slice(0, 1));
});

test("canonical root discovery contains five reusable varieties", () => {
  assert.deepEqual(rootVarieties.map((root) => root.id), ["ubi-ungu", "ubi-madu", "ubi-oranye", "ubi-merah", "ubi-jepang"]);
});

test("every approved available root offering exposes commerce sizes", () => {
  const available = productRootOfferings.filter((offering) => offering.status === "available");
  assert.deepEqual(available.map((offering) => offering.id), ["flour-ubi-ungu", "shake-ubi-ungu", "ppang-ubi-ungu", "mie-ubi-ungu"]);
  assert.ok(available.every((offering) => offering.sizeIds.length > 0));
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
