"use client";

import Link from "next/link";

export function CheckoutCancel() {
  return <div className="checkout-page success-page">
    <header><span className="eyebrow">CHECKOUT</span><h1>Pembayaran dibatalkan.</h1></header>
    <div className="success-panel failed" role="status">
      <p>Anda membatalkan pembayaran — tidak ada dana yang terpotong. Keranjang Anda tetap tersimpan bila ingin mencoba lagi.</p>
      <div className="success-actions">
        <Link className="button primary" href="/cart">Kembali ke keranjang <span>→</span></Link>
        <Link className="button warm" href="/products">Lihat produk lain</Link>
      </div>
    </div>
  </div>;
}
