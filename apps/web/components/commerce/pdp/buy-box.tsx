"use client";

import { useState } from "react";
import type { Product } from "@yubie/domain";
import { useCart, MAX_CART_LINE_QUANTITY } from "@/features/cart/cart-context";
import { formatRupiah } from "@/lib/format";

/**
 * Buy box for commercially available products. Prices shown here are catalog
 * display values only — final transaction amounts are owned by the purchase
 * channel (marketplace partner today, the checkout API once payments are
 * approved).
 */
export function BuyBox({ product }: { product: Product }) {
  const { addItem } = useCart();
  const pricedSizes = product.sizes.filter((size) => size.available && typeof size.price === "number");
  const [sizeId, setSizeId] = useState(pricedSizes[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const size = pricedSizes.find((item) => item.id === sizeId) ?? pricedSizes[0];

  if (!size || typeof size.price !== "number") return null;

  return <div className="buy-box">
    {pricedSizes.length > 1 && <fieldset className="option-set size-option-set">
      <legend>Ukuran</legend>
      <div>
        {pricedSizes.map((item) => <button type="button" key={item.id} aria-pressed={size.id === item.id} className={size.id === item.id ? "selected" : ""} onClick={() => setSizeId(item.id)}>
          <span>{item.label}</span>
          <small>{formatRupiah(item.price ?? 0)}</small>
        </button>)}
      </div>
    </fieldset>}
    <div className="purchase-row">
      <div className="quantity-control">
        <button type="button" aria-label="Kurangi jumlah" onClick={() => setQuantity((value) => Math.max(1, value - 1))} disabled={quantity <= 1}>−</button>
        <span aria-live="polite">{quantity}</span>
        <button type="button" aria-label="Tambah jumlah" onClick={() => setQuantity((value) => Math.min(MAX_CART_LINE_QUANTITY, value + 1))} disabled={quantity >= MAX_CART_LINE_QUANTITY}>+</button>
      </div>
      <button type="button" className="button primary full" onClick={() => addItem(product.id, size.id, quantity)}>Add to Cart · {formatRupiah(size.price * quantity)}</button>
    </div>
    <p className="delivery-note">Pembelian resmi melalui marketplace partner—harga dan stok final mengikuti toko saat transaksi.</p>
  </div>;
}
