"use client";

import Link from "next/link";
import { useEffect } from "react";
import { PurchaseOptions } from "@/components/commerce/purchase-options";
import { useCart, useCartDisplayLines } from "@/features/cart/cart-context";
import { trackEvent } from "@/lib/analytics";
import { formatRupiah } from "@/lib/format";

export function CartView() {
  const { hydrated, setQuantity, removeItem, clear, count } = useCart();
  const lines = useCartDisplayLines();

  useEffect(() => { if (hydrated && count > 0) trackEvent("view_cart", { item_count: count }); }, [hydrated, count]);

  if (!hydrated) return <div className="cart-page" aria-busy="true"><p className="cart-loading">Memuat keranjang…</p></div>;

  if (count === 0 || lines.length === 0) {
    return <div className="cart-page empty-cart">
      <div className="slice-mark" aria-hidden="true">✦</div>
      <h1>Keranjang masih kosong.</h1>
      <p>Jelajahi keluarga produk Yubie—dari tepung serbaguna hingga format yang sedang berbuah.</p>
      <Link className="button primary" href="/products">Lihat produk <span>→</span></Link>
    </div>;
  }

  const subtotal = lines.reduce((total, item) => total + item.lineTotal, 0);
  const hasFlour = lines.some(({ line }) => line.productId === "flour");

  return <div className="cart-page">
    <header><span className="eyebrow">YUBIE CART</span><h1>Keranjang</h1></header>
    <div className="cart-page-grid">
      <section aria-label="Item keranjang">
        {lines.map(({ line, product, size, lineTotal }) => <article key={`${line.productId}-${line.sizeId}`}>
          <div><h2>{product.name}</h2><p>{size.label}{product.id === "flour" ? " · Ubi Ungu" : ""}</p></div>
          <div className="quantity-row" aria-label={`Jumlah ${product.name}`}>
            <button aria-label={`Kurangi jumlah ${product.name} ${size.label}`} onClick={() => setQuantity(line.productId, line.sizeId, line.quantity - 1)} disabled={line.quantity <= 1}>−</button>
            <span aria-live="polite">{line.quantity}</span>
            <button aria-label={`Tambah jumlah ${product.name} ${size.label}`} onClick={() => setQuantity(line.productId, line.sizeId, line.quantity + 1)}>+</button>
          </div>
          <strong>{formatRupiah(lineTotal)}</strong>
          <button className="remove-link" aria-label={`Hapus ${product.name} ${size.label}`} onClick={() => removeItem(line.productId, line.sizeId)}>Hapus</button>
        </article>)}
        <button className="remove-link" onClick={clear}>Kosongkan keranjang</button>
      </section>
      <aside aria-label="Ringkasan belanja">
        <span className="eyebrow">RINGKASAN</span>
        <div><span>Subtotal</span><strong>{formatRupiah(subtotal)}</strong></div>
        <p>Ongkir, pajak, dan total final ditentukan saat pembelian di marketplace partner. Checkout langsung di yubie.id akan hadir setelah persiapan pembayaran selesai.</p>
        {hasFlour && <PurchaseOptions productSlug="yubie-flour" productId="flour" placement="cart" compact />}
        <Link className="button primary full" href="/checkout">Lanjut ke Checkout <span>→</span></Link>
      </aside>
    </div>
  </div>;
}
