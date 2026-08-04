"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { useCart } from "@/features/cart/cart-context";
import { formatRupiah } from "@/lib/format";

export function CartDrawer() {
  const { items, subtotal, open, setOpen, updateQuantity, removeItem } = useCart();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [open, setOpen]);

  if (!open) return null;
  return (
    <div className="drawer-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
      <aside className="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cart-title">
        <div className="drawer-header">
          <div><span className="eyebrow">YOUR SELECTION</span><h2 id="cart-title">Keranjang</h2></div>
          <button ref={closeRef} className="icon-button" onClick={() => setOpen(false)} aria-label="Tutup keranjang">×</button>
        </div>
        <div className="drawer-content">
          {items.length === 0 ? (
            <div className="empty-cart"><span className="slice-mark">Y</span><h3>Masih kosong.</h3><p>Mulai dari Yubie Flour dan buat sesuatu yang baru.</p><Link className="button primary" href="/shop" onClick={() => setOpen(false)}>Shop Yubie</Link></div>
          ) : items.map((item) => (
            <article className="cart-line" key={item.id}>
              <Image src={item.image} alt="" width={96} height={96} unoptimized />
              <div className="cart-line-copy"><h3>{item.name}</h3><p>{item.sizeLabel} · {formatRupiah(item.unitPrice)}</p>
                <div className="quantity-row"><button onClick={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))} aria-label={`Kurangi ${item.name}`}>−</button><span>{item.quantity}</span><button onClick={() => updateQuantity(item.id, item.quantity + 1)} aria-label={`Tambah ${item.name}`}>+</button><button className="remove" onClick={() => removeItem(item.id)}>Hapus</button></div>
              </div>
            </article>
          ))}
        </div>
        {items.length > 0 && <div className="drawer-footer"><div><span>Subtotal</span><strong>{formatRupiah(subtotal)}</strong></div><p>Pengiriman dan pembayaran akan dikonfirmasi pada tahap checkout.</p><Link className="button primary full" href="/checkout" onClick={() => setOpen(false)}>Lanjut ke Checkout <span>→</span></Link></div>}
      </aside>
    </div>
  );
}
