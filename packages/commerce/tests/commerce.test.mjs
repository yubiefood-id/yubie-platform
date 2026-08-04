import assert from "node:assert/strict";
import test from "node:test";
import { PreviewCommerceProvider } from "../dist/index.js";

test("preview provider creates deterministic non-payable sessions", async () => {
  const provider = new PreviewCommerceProvider();
  const input = {
    lines: [{ id: "flour-250g", productId: "flour", name: "Yubie Flour", sizeId: "250g", sizeLabel: "250 g", quantity: 1, unitPrice: 15000, image: "/flour.webp" }],
    customerEmail: "buyer@example.com",
    successUrl: "https://example.com/success",
    cancelUrl: "https://example.com/cart",
  };
  const first = await provider.createCheckout(input);
  const second = await provider.createCheckout(input);
  assert.equal(first.id, second.id);
  assert.equal(first.status, "preview");
  assert.equal(first.redirectUrl, null);
});
