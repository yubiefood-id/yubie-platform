"use client";

import { useState } from "react";
import type { Product, ProductSize } from "@yubie/domain";
import { useCart, MAX_CART_LINE_QUANTITY } from "@/features/cart/cart-context";
import { formatRupiah } from "@/lib/format";
import { directCommerce } from "@/config/launch";

/**
 * Buy box for commercially available products. Prices shown here are catalog
 * display values only — final transaction amounts are owned by the purchase
 * channel (marketplace partner today, the checkout API once payments are
 * approved).
 */
export function BuyBox({ product }: { product: Product }) {
  const pricedSizes = product.sizes.filter((size) => size.available && typeof size.price === "number");
  const [sizeId, setSizeId] = useState(pricedSizes[0]?.id ?? "");
  const size = pricedSizes.find((item) => item.id === sizeId) ?? pricedSizes[0];

  if (!size || typeof size.price !== "number") return null;

  return <div className="buy-box">
    <fieldset className="option-set size-option-set">
      <legend>Ukuran</legend>
      <div>
        {pricedSizes.map((item) => <button type="button" key={item.id} aria-pressed={size.id === item.id} className={size.id === item.id ? "selected" : ""} onClick={() => setSizeId(item.id)}>
          <span>{item.label}</span>
          <small>{formatRupiah(item.price ?? 0)}</small>
        </button>)}
      </div>
    </fieldset>
    <p className="price-tag">Harga katalog · {formatRupiah(size.price)}</p>
    {size.sku && <p className="delivery-note">SKU: {size.sku}</p>}
    {directCommerce && <CartControls product={product} size={size} />}
    <p className="delivery-note">{directCommerce ? "Pembelian resmi melalui marketplace partner—harga dan stok final mengikuti toko saat transaksi." : "Informasi katalog. Harga dan stok transaksi mengikuti kanal resmi yang telah disetujui."}</p>
  </div>;
}

function CartControls({ product, size }: { product: Product; size: ProductSize }) {
  const { addItem, hydrated } = useCart();
  const [quantity, setQuantity] = useState(1);
  return <div className="purchase-row">
      <div className="quantity-control">
        <button type="button" aria-label="Kurangi jumlah" onClick={() => setQuantity((value) => Math.max(1, value - 1))} disabled={quantity <= 1}>−</button>
        <span aria-live="polite">{quantity}</span>
        <button type="button" aria-label="Tambah jumlah" onClick={() => setQuantity((value) => Math.min(MAX_CART_LINE_QUANTITY, value + 1))} disabled={quantity >= MAX_CART_LINE_QUANTITY}>+</button>
      </div>
      <button type="button" className="button primary full" disabled={!hydrated} onClick={() => addItem(product.id, size.id, quantity)}>Add to Cart · {formatRupiah((size.price ?? 0) * quantity)}</button>
    </div>;
}
