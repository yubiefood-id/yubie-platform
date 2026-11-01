"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import {CHECKOUT_ATTEMPT_STORAGE_KEY} from "@/lib/proxy-headers";
import { formatRupiah } from "@/lib/format";

interface CheckoutStatus {
  checkoutToken: string;
  reconciliationException?: boolean;
  fulfillmentHold?: boolean;
  resumeUrl?: string|null;
  checkoutRef: string;
  orderStatus: string;
  paymentStatus: string | null;
  totalAmount: number;
  lines: Array<{ productName: string; sizeLabel: string; quantity: number; unitPrice: number }>;
}

type SuccessPhase = "verifying" | "confirmed" | "pending" | "failed" | "expired" | "cancelled" | "unknown" | "exception" | "not_found";
/** PII-free courier tracking served by the checkout-token-scoped API route. */
interface ShipmentTracking { status: string; courierCompany: string | null; courierService: string | null; waybillId: string | null; trackingId: string | null; trackingUrl: string | null; latestProviderStatus: string | null; updatedAt: string }

const SHIPMENT_STATUS_LABELS: Record<string, string> = {
  not_ready: "Menunggu pengepakan", ready: "Sudah dikemas", booking_pending: "Memesan kurir",
  booking_unknown: "Sedang dikonfirmasi", booked: "Kurir dipesan", pickup_pending: "Menunggu penjemputan",
  picked: "Paket diambil kurir", in_transit: "Dalam perjalanan", delivered: "Terkirim",
  cancelled: "Dibatalkan", failed: "Gagal dikirim", returned: "Dikembalikan", held: "Ditahan untuk peninjauan",
};

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 15;

/**
 * The success page NEVER assumes success. It receives only a checkout id,
 * asks the API for the server-verified status, and renders the state it is
 * told — payment confirmation comes from the webhook (or the server-side
 * provider poll), never from the redirect itself.
 */
export function CheckoutSuccess() {
  const searchParams = useSearchParams();
  const checkoutId = searchParams.get("checkout");
  const [phase, setPhase] = useState<SuccessPhase>(checkoutId ? "verifying" : "not_found");
  const [status, setStatus] = useState<CheckoutStatus | null>(null);
  const pollCount = useRef(0);
  const purchaseTracked = useRef(false);
  const [tracking, setTracking] = useState<ShipmentTracking | null>(null);

  useEffect(() => {
    // Only once the order is confirmed paid do we surface courier tracking;
    // the endpoint itself is token-scoped and exposes no address or cost.
    if (phase !== "confirmed" || !checkoutId) return;
    let active = true;
    const load = () => { void fetch(`/api/checkout/${encodeURIComponent(checkoutId)}/shipment`, { cache: "no-store", signal: AbortSignal.timeout(8000) })
      .then(async (response) => { if (!active || !response.ok) return; const payload = await response.json().catch(() => null); if (payload?.ok && payload.data?.shipment) setTracking(payload.data.shipment as ShipmentTracking); })
      .catch(() => {/* Tracking stays hidden when unavailable; the order status above remains authoritative. */}); };
    load();
    const interval = setInterval(load, 15000);
    return () => { active = false; clearInterval(interval); };
  }, [phase, checkoutId]);

  const poll = useCallback(async () => {
    if (!checkoutId) return;
    const response = await fetch(`/api/checkout/${encodeURIComponent(checkoutId)}`,{cache:"no-store",signal:AbortSignal.timeout(10000)}).catch(() => null);
    if (!response || !response.ok) {
      setPhase(response?.status===404?"not_found":"unknown");
      return;
    }
    const payload = await response.json().catch(() => null);
    const data = payload?.data as CheckoutStatus | undefined;
    if (!data) { setPhase("not_found"); return; }
    setStatus(data);
    if(data.reconciliationException){setPhase("exception");return;}
    const closeHeld=()=>{try{const held=JSON.parse(localStorage.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY)??"null");if(held?.checkoutToken===checkoutId){localStorage.removeItem(CHECKOUT_ATTEMPT_STORAGE_KEY);sessionStorage.removeItem(CHECKOUT_ATTEMPT_STORAGE_KEY);}}catch{/* Keep uncertain recovery identity. */}};
    if (data.orderStatus === "paid" || data.orderStatus === "processing" || data.orderStatus === "shipped" || data.orderStatus === "completed") {
      closeHeld();setPhase("confirmed");
      if (!purchaseTracked.current) {
        purchaseTracked.current = true;
        trackEvent("purchase", { checkout_id: data.checkoutRef, value: data.totalAmount, currency: "IDR" });
      }
      return;
    }
    if (data.paymentStatus === "failed") { closeHeld();setPhase("failed"); return; }
    if (data.paymentStatus === "expired") { closeHeld();setPhase("expired"); return; }
    if (data.paymentStatus === "cancelled") { closeHeld();setPhase("cancelled"); return; }
    setPhase("pending");
  }, [checkoutId]);

  useEffect(() => {
    if (!checkoutId) return;
    const initial = setTimeout(() => { void poll(); }, 0);
    const interval = setInterval(() => {
      pollCount.current += 1;
      if (pollCount.current > MAX_POLLS) { clearInterval(interval); return; }
      void poll();
    }, POLL_INTERVAL_MS);
    return () => { clearTimeout(initial); clearInterval(interval); };
  }, [checkoutId, poll]);

  return <div className="checkout-page success-page">
    <header><span className="eyebrow">STATUS PEMBAYARAN</span><h1>{phase === "confirmed" ? "Pembayaran terkonfirmasi." : "Memverifikasi pembayaran."}</h1></header>
    {phase === "verifying" || phase === "pending" || phase === "unknown" ? <div className="success-panel" role="status" aria-live="polite">
      <div className="loading-line" aria-hidden="true" />
      <p>Konfirmasi pembayaran diproses di server. Jangan melakukan pembayaran kedua. Periksa ulang status bila konfirmasi belum tersedia.</p>
      {status && <p className="checkout-note">Status saat ini: pesanan <strong>{status.orderStatus.replace(/_/g, " ")}</strong> · pembayaran <strong>{status.paymentStatus ?? "menunggu"}</strong>.</p>}
      <button className="button warm" onClick={() => void poll()}>Periksa ulang status</button>
      {phase==="pending"&&status?.resumeUrl&&<a className="button primary" href={status.resumeUrl}>Lanjutkan pembayaran yang sama</a>}
    </div> : null}
    {phase === "confirmed" && status && <div className="success-panel confirmed" role="status">
      <span className="success-mark" aria-hidden="true">✓</span>
      <h2>Terima kasih! Pesanan Anda diterima.</h2>
      <p>Nomor pesanan <strong>{status.checkoutRef}</strong> — simpan nomor ini untuk referensi.</p>
      <div className="success-lines">{(status.lines??[]).map((line) => <div key={`${line.productName}-${line.sizeLabel}`}><span>{line.productName} · {line.sizeLabel} × {line.quantity}</span><span>{formatRupiah(line.unitPrice * line.quantity)}</span></div>)}
        <div className="total"><span>Total dibayar</span><span>{formatRupiah(status.totalAmount)}</span></div>
      </div>
      {status.fulfillmentHold&&<p role="status">Pesanan perlu ditinjau oleh tim sebelum pengiriman.</p>}
      {tracking&&<div className="shipment-tracking" role="status">
        <span className="eyebrow">STATUS PENGIRIMAN</span>
        <p><strong>{SHIPMENT_STATUS_LABELS[tracking.status] ?? tracking.status.replace(/_/g, " ")}</strong>{tracking.courierCompany?` · ${tracking.courierCompany}${tracking.courierService?` ${tracking.courierService}`:""}`:""}</p>
        {tracking.waybillId&&<p className="checkout-note">Nomor resi <strong>{tracking.waybillId}</strong></p>}
        {tracking.trackingUrl&&<a className="button warm" href={tracking.trackingUrl} rel="noreferrer noopener" target="_blank">Lacak paket <span>→</span></a>}
      </div>}
      <div className="success-actions"><Link className="button primary" href="/account/orders">Lihat pesanan saya <span>→</span></Link><Link className="button warm" href="/products">Lanjut menjelajah</Link></div>
    </div>}
    {phase === "failed" && <div className="success-panel failed" role="alert">
      <h2>Pembayaran tidak berhasil.</h2>
      <p>Penyedia mengonfirmasi pembayaran tidak berhasil. Periksa status pesanan ini sebelum memulai percobaan lain.</p>
      <Link className="button primary" href="/cart">Kembali ke keranjang <span>→</span></Link>
    </div>}
    {phase === "expired" && <div className="success-panel failed" role="alert">
      <h2>Sesi pembayaran kedaluwarsa.</h2>
      <p>Penyedia mengonfirmasi sesi pembayaran kedaluwarsa. Isi keranjang tetap tersimpan.</p>
      <Link className="button primary" href="/cart">Buat ulang pesanan <span>→</span></Link>
    </div>}
    {phase==="cancelled"&&<div className="success-panel" role="status"><h2>Pembatalan terkonfirmasi.</h2><p>Status pembatalan telah diverifikasi oleh server.</p><Link className="button primary" href="/cart">Kembali ke keranjang</Link></div>}
    {phase==="exception"&&<div className="success-panel" role="alert"><h2>Pembayaran perlu ditinjau.</h2><p>Jangan melakukan pembayaran kedua. Tim Yubie perlu merekonsiliasi status pesanan ini.</p></div>}
    {phase === "not_found" && <div className="success-panel failed" role="alert">
      <h2>Pesanan tidak ditemukan.</h2>
      <p>Nomor checkout tidak valid atau sudah tidak tersedia.</p>
      <Link className="button primary" href="/products">Kembali ke produk <span>→</span></Link>
    </div>}
  </div>;
}
