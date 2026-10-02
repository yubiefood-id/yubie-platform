"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatRupiah } from "@/lib/format";

interface OrderSummary { checkoutId: string; orderStatus: string; totalAmount: number; currency: string; createdAt: string; lineCount: number; }

export function OrdersView() {
  const router = useRouter();
  const [phase, setPhase] = useState<"loading" | "unauthenticated" | "ready">("loading");
  const [orders, setOrders] = useState<OrderSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const response = await fetch("/api/auth/session").catch(() => null);
      const payload = await response?.json().catch(() => null);
      if (cancelled) return;
      if (!response?.ok || !payload?.data?.authenticated) { setPhase("unauthenticated"); return; }
      const ordersResponse = await fetch("/api/account/orders").catch(() => null);
      const ordersPayload = await ordersResponse?.json().catch(() => null);
      if (!cancelled && ordersPayload?.ok) setOrders(ordersPayload.data as OrderSummary[]);
      if (!cancelled) setPhase("ready");
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { if (phase === "unauthenticated") router.replace("/login?next=/account/orders"); }, [phase, router]);

  if (phase !== "ready") return <div className="account-page" aria-busy="true"><p className="cart-loading">{phase === "unauthenticated" ? "Mengalihkan ke halaman masuk…" : "Memuat pesanan…"}</p></div>;

  return <div className="account-page">
    <header><span className="eyebrow">AKUN SAYA</span><h1>Riwayat<br /><em>pesanan.</em></h1></header>
    {orders.length ? <ul className="order-list wide">{orders.map((order) => <li key={order.checkoutId}>
      <Link href={`/account/orders/${order.checkoutId}`}>
        <span>{new Date(order.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</span>
        <strong>{order.lineCount} item · {formatRupiah(order.totalAmount)}</strong>
        <span className="order-status">{order.orderStatus.replace(/_/g, " ")}</span>
      </Link>
    </li>)}</ul> : <div className="empty-cart"><div className="slice-mark" aria-hidden="true">✦</div><h2>Belum ada pesanan.</h2><p>Pesanan yang Anda buat akan tampil di sini.</p><Link className="button primary" href="/products">Mulai belanja <span>→</span></Link></div>}
  </div>;
}
