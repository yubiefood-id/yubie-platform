"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { formatRupiah } from "@/lib/format";
import type { PublicUser } from "@yubie/domain";

interface OrderSummary {
  checkoutId: string;
  orderStatus: string;
  totalAmount: number;
  currency: string;
  createdAt: string;
  lineCount: number;
}

type AccountPhase = "loading" | "unauthenticated" | "ready";

export function AccountView() {
  const router = useRouter();
  const [phase, setPhase] = useState<AccountPhase>("loading");
  const [user, setUser] = useState<PublicUser | null>(null);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const response = await fetch("/api/auth/session").catch(() => null);
      const payload = await response?.json().catch(() => null);
      if (cancelled) return;
      if (!response?.ok || !payload?.data?.authenticated) { setPhase("unauthenticated"); return; }
      setUser(payload.data.user as PublicUser);
      const ordersResponse = await fetch("/api/account/orders").catch(() => null);
      const ordersPayload = await ordersResponse?.json().catch(() => null);
      if (!cancelled && ordersPayload?.ok) setOrders(ordersPayload.data as OrderSummary[]);
      if (!cancelled) setPhase("ready");
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (phase === "unauthenticated") router.replace("/login?next=/account");
  }, [phase, router]);

  const logout = async () => {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    router.replace("/");
  };

  if (phase === "loading") return <div className="account-page" aria-busy="true"><p className="cart-loading">Memuat akun…</p></div>;
  if (phase === "unauthenticated") return <div className="account-page" aria-busy="true"><p className="cart-loading">Mengalihkan ke halaman masuk…</p></div>;

  const recent = orders[0];

  return <div className="account-page">
    <header><span className="eyebrow">AKUN SAYA</span><h1>Halo{user?.name ? `, ${user.name.split(" ")[0]}` : ""}.<br /><em>Rooted here.</em></h1></header>
    <div className="account-grid">
      <section aria-label="Pesanan saya">
        <h2>Pesanan terbaru</h2>
        {recent ? <Link className="order-card" href={`/account/orders/${recent.checkoutId}`}>
          <span className="eyebrow">{new Date(recent.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</span>
          <strong>{recent.lineCount} item · {formatRupiah(recent.totalAmount)}</strong>
          <span className="order-status">{recent.orderStatus.replace(/_/g, " ")}</span>
        </Link> : <p className="checkout-note">Belum ada pesanan. Pesanan pertama Anda akan tampil di sini.</p>}
        <h2>Riwayat pesanan</h2>
        {orders.length ? <ul className="order-list">{orders.map((order) => <li key={order.checkoutId}>
          <Link href={`/account/orders/${order.checkoutId}`}>
            <span>{new Date(order.createdAt).toLocaleDateString("id-ID")}</span>
            <strong>{formatRupiah(order.totalAmount)}</strong>
            <span className="order-status">{order.orderStatus.replace(/_/g, " ")}</span>
          </Link>
        </li>)}</ul> : <p className="checkout-note">Riwayat kosong.</p>}
      </section>
      <aside aria-label="Profil">
        <span className="eyebrow">PROFIL</span>
        {user?.picture ? <Image className="account-avatar" src={user.picture} alt="" width={64} height={64} unoptimized referrerPolicy="no-referrer" /> : null}
        <p><strong>{user?.name ?? "Pengguna Yubie"}</strong></p>
        <p>{user?.email ?? "Email tidak dibagikan."}</p>
        <p className="checkout-note">Informasi pengiriman diambil dari detail pesanan masing-masing.</p>
        <button className="button warm" onClick={logout} disabled={loggingOut}>{loggingOut ? "Keluar…" : "Keluar"}</button>
        {!loggingOut && <button className="text-button" onClick={() => trackEvent("account_view", {})} hidden aria-hidden="true" />}
      </aside>
    </div>
  </div>;
}
