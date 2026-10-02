"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { useCart, useCartDisplayLines } from "@/features/cart/cart-context";
import { useFocusTrap } from "@/lib/a11y";
import { formatRupiah } from "@/lib/format";

export function CartDrawer() {
  const { isOpen, closeCart, setQuantity, removeItem, count } = useCart();
  const lines = useCartDisplayLines();
  const layerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(layerRef, isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") closeCart(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, closeCart]);

  if (!isOpen) return null;
  const subtotal = lines.reduce((total, item) => total + item.lineTotal, 0);

  return <div className="drawer-layer" ref={layerRef} role="dialog" aria-modal="true" aria-label="Keranjang belanja">
    <section className="cart-drawer" aria-label="Isi keranjang">
      <header className="drawer-header">
        <div><span className="eyebrow">YUBIE CART</span><h2>Keranjang</h2></div>
        <button className="icon-button" onClick={closeCart} aria-label="Tutup keranjang">×</button>
      </header>
      {count === 0 ? <div className="drawer-content"><div className="empty-cart"><div className="slice-mark" aria-hidden="true">✦</div><h3>Keranjang masih kosong.</h3><p>Jelajahi keluarga produk Yubie dan temukan format favorit Anda.</p><Link className="button primary" href="/products" onClick={closeCart}>Lihat produk <span>→</span></Link></div></div> : <>
        <div className="drawer-content">
          {lines.map(({ line, product, size, lineTotal }) => <article className="cart-line" key={`${line.productId}-${line.sizeId}`}>
            <Image src={product.image} alt={product.imageAlt} width={92} height={92} unoptimized />
            <div>
              <h3>{product.name}</h3>
              <p>{size.label}</p>
              <div className="quantity-row">
                <button aria-label={`Kurangi jumlah ${product.name} ${size.label}`} onClick={() => setQuantity(line.productId, line.sizeId, line.quantity - 1)} disabled={line.quantity <= 1}>−</button>
                <span aria-live="polite">{line.quantity}</span>
                <button aria-label={`Tambah jumlah ${product.name} ${size.label}`} onClick={() => setQuantity(line.productId, line.sizeId, line.quantity + 1)}>+</button>
                <button className="remove" aria-label={`Hapus ${product.name} ${size.label} dari keranjang`} onClick={() => removeItem(line.productId, line.sizeId)}>Hapus</button>
              </div>
            </div>
            <strong>{formatRupiah(lineTotal)}</strong>
          </article>)}
          <p className="drawer-note">Harga tampil dari katalog terverifikasi. Checkout resmi saat ini diselesaikan melalui marketplace partner.</p>
        </div>
        <footer className="drawer-footer">
          <div><span>Subtotal</span><strong>{formatRupiah(subtotal)}</strong></div>
          <p>Ongkir dan total final ditentukan saat pembelian di marketplace partner.</p>
          <div className="drawer-actions">
            <Link className="button warm" href="/cart" onClick={closeCart}>Lihat Keranjang</Link>
            <Link className="button primary" href="/checkout" onClick={closeCart}>Checkout <span>→</span></Link>
          </div>
        </footer>
      </>}
    </section>
  </div>;
}
