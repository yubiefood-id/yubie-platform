"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatRupiah } from "@/lib/format";

interface OrderDetail {
  checkoutId: string;
  checkoutRef: string;
  orderStatus: string;
  paymentStatus: string | null;
  totalAmount: number;
  lines: Array<{ productName: string; sizeLabel: string; quantity: number; unitPrice: number }>;
  delivery: { name?: string; phone: string; address: string; city: string; postalCode?: string } | null;
  customerEmail: string;
  createdAt: string;
}

export function OrderDetailView() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const orderId = params?.id;
  const [phase, setPhase] = useState<"loading" | "unauthenticated" | "ready" | "not_found">("loading");
  const [order, setOrder] = useState<OrderDetail | null>(null);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    (async () => {
      const response = await fetch("/api/auth/session").catch(() => null);
      const payload = await response?.json().catch(() => null);
      if (cancelled) return;
      if (!response?.ok || !payload?.data?.authenticated) { setPhase("unauthenticated"); return; }
      const orderResponse = await fetch(`/api/account/orders/${encodeURIComponent(orderId)}`).catch(() => null);
      const orderPayload = await orderResponse?.json().catch(() => null);
      if (cancelled) return;
      if (!orderResponse?.ok || !orderPayload?.ok) { setPhase("not_found"); return; }
      setOrder(orderPayload.data as OrderDetail);
      setPhase("ready");
    })();
    return () => { cancelled = true; };
  }, [orderId]);

  useEffect(() => { if (phase === "unauthenticated") router.replace(`/login?next=/account/orders/${orderId ?? ""}`); }, [phase, router, orderId]);

  if (phase === "loading" || phase === "unauthenticated") return <div className="account-page" aria-busy="true"><p className="cart-loading">Memuat pesanan…</p></div>;
  if (phase === "not_found" || !order) return <div className="account-page empty-cart"><h2>Pesanan tidak ditemukan.</h2><Link className="button primary" href="/account/orders">Kembali ke riwayat</Link></div>;

  return <div className="account-page">
    <header><span className="eyebrow">PESANAN {order.checkoutRef}</span><h1>Detail<br /><em>pesanan.</em></h1></header>
    <div className="account-grid">
      <section aria-label="Item pesanan">
        <h2>Status</h2>
        <p><strong>Pesanan:</strong> {order.orderStatus.replace(/_/g, " ")} · <strong>Pembayaran:</strong> {order.paymentStatus?.replace(/_/g, " ") ?? "menunggu"}</p>
        <p className="checkout-note">Dibuat {new Date(order.createdAt).toLocaleString("id-ID")}</p>
        <h2>Item</h2>
        <ul className="order-lines">{order.lines.map((line) => <li key={`${line.productName}-${line.sizeLabel}`}>
          <span>{line.productName} · {line.sizeLabel} × {line.quantity}</span>
          <strong>{formatRupiah(line.unitPrice * line.quantity)}</strong>
        </li>)}
          <li className="total"><span>Total</span><strong>{formatRupiah(order.totalAmount)}</strong></li>
        </ul>
      </section>
      <aside aria-label="Pengiriman">
        <span className="eyebrow">PENGIRIMAN</span>
        {order.delivery ? <p>{order.delivery.name ? <><strong>{order.delivery.name}</strong><br /></> : null}{order.delivery.address}<br />{order.delivery.city}{order.delivery.postalCode ? ` ${order.delivery.postalCode}` : ""}<br />{order.delivery.phone}</p> : <p className="checkout-note">Informasi pengiriman tidak tersimpan untuk pesanan ini.</p>}
        <p className="checkout-note">Konfirmasi dikirim ke {order.customerEmail}.</p>
        <Link className="button warm" href="/account/orders">← Semua pesanan</Link>
      </aside>
    </div>
  </div>;
}
