import assert from "node:assert/strict";
import test from "node:test";
import { calculateSubtotal } from "../dist/index.js";

test("calculateSubtotal totals Indonesian rupiah line items", () => {
  assert.equal(calculateSubtotal([
    { id: "flour-250g", productId: "flour", name: "Yubie Flour", sizeId: "250g", sizeLabel: "250 g", quantity: 2, unitPrice: 15000, image: "/flour.webp" },
    { id: "flour-500g", productId: "flour", name: "Yubie Flour", sizeId: "500g", sizeLabel: "500 g", quantity: 1, unitPrice: 28000, image: "/flour.webp" },
  ]), 58000);
});
