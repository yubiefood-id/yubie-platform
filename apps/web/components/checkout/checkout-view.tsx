"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { quotePromotion } from "@yubie/domain";
import { PurchaseOptions } from "@/components/commerce/purchase-options";
import { useCart, useCartDisplayLines } from "@/features/cart/cart-context";
import { trackEvent } from "@/lib/analytics";
import { formatRupiah } from "@/lib/format";
import { CHECKOUT_ATTEMPT_STORAGE_KEY, storedAttemptForRequest, attemptOutcomeForHttpStatus, classifyCheckoutResponse, type HeldAttempt } from "@/lib/proxy-headers";

type CheckoutPhase = "form" | "creating" | "redirecting" | "pending" | "error";

interface CheckoutFormState {
  email: string;
  name: string;
  phone: string;
  address: string;
  city: string;
  postalCode: string;
}

const EMPTY_FORM: CheckoutFormState = { email: "", name: "", phone: "", address: "", city: "", postalCode: "" };

async function prepareCheckoutSession(): Promise<boolean> {
  try {
    const response = await fetch("/api/checkout/session", { cache: "no-store" });
    const payload = await response.json();
    return response.ok && payload?.ok === true && payload?.data?.ready === true;
  } catch { return false; }
}

/**
 * Live checkout state machine: idle → validating → creating checkout →
 * redirect to the provider-hosted page. If the backend is still in preview
 * mode (payments not yet enabled), the honest preview panel is shown — a
 * successful payment is never faked.
 */
export function CheckoutView() {
  const { hydrated, count, promoCode, applyPromo, clearPromo } = useCart();
  const lines = useCartDisplayLines();
  const [phase, setPhase] = useState<CheckoutPhase>("form");
  const [form, setForm] = useState<CheckoutFormState>(EMPTY_FORM);
  const [mode, setMode] = useState<"unknown" | "live" | "preview">("unknown");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // One logical checkout attempt = one idempotency key, bound to the cart it
  // was minted for. The key survives an ambiguous outcome so a retry dedupes
  // at the server; a definitive HTTP response closes the attempt.
  const attemptRef = useRef<HeldAttempt | null>(null);
  // The guest checkout cookie is issued before the first submit so a lost
  // first response cannot leave the retry under a different guest identity.
  const sessionReadyRef = useRef<Promise<boolean> | null>(null);

  useEffect(() => { if (hydrated && count > 0) trackEvent("begin_checkout", { item_count: count }); }, [hydrated, count]);
  useEffect(() => {
    sessionReadyRef.current = prepareCheckoutSession();
  }, []);

  if (!hydrated) return <div className="checkout-page" aria-busy="true"><p className="cart-loading">Memuat checkout…</p></div>;

  if (count === 0 || lines.length === 0) {
    return <div className="checkout-page empty-cart">
      <div className="slice-mark" aria-hidden="true">✦</div>
      <h1>Tidak ada yang bisa di-checkout.</h1>
      <p>Keranjang Anda kosong. Pilih produk Yubie terlebih dahulu.</p>
      <Link className="button primary" href="/products">Lihat produk <span>→</span></Link>
    </div>;
  }

  const subtotal = lines.reduce((total, item) => total + item.lineTotal, 0);
  const promotion = quotePromotion(promoCode, subtotal);
  const total = subtotal - (promotion?.discountAmount ?? 0);
  const hasFlour = lines.some(({ line }) => line.productId === "flour");
  const formValid = form.email.includes("@") && form.phone.trim().length >= 8 && form.address.trim().length >= 8 && form.city.trim().length >= 2;

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!formValid || phase === "creating" || phase === "redirecting") return;
    setPhase("creating");
    setErrorMessage(null);
    const body = JSON.stringify({
      lines: lines.map(({ line }) => ({ productId: line.productId, sizeId: line.sizeId, quantity: line.quantity })),
      customerEmail: form.email.trim(),
      ...(form.name.trim() ? { customerName: form.name.trim() } : {}),
      delivery: {
        ...(form.name.trim() ? { name: form.name.trim() } : {}),
        phone: form.phone.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        ...(form.postalCode.trim() ? { postalCode: form.postalCode.trim() } : {}),
      },
      ...(promoCode ? { promoCode } : {}),
    });
    try {
      const ready = await (sessionReadyRef.current ??= prepareCheckoutSession());
      if (!ready) {
        sessionReadyRef.current = null;
        setPhase("error");
        setErrorMessage("Sesi checkout belum dapat disiapkan. Periksa koneksi lalu coba lagi. Pesanan belum dikirim.");
        return;
      }
      let attempt: HeldAttempt;
      try {
        attempt = await storedAttemptForRequest(sessionStorage, body, crypto.randomUUID());
        attemptRef.current = attempt;
      } catch {
        setPhase("error");
        setErrorMessage("Percobaan checkout belum dapat disimpan dengan aman. Izinkan penyimpanan sesi browser atau hubungi kami sebelum mencoba lagi.");
        return;
      }
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": attempt.key },
        body,
      });
      const payload = await response.json().catch(() => null);
      if (attemptOutcomeForHttpStatus(response.status) === "definitive") {
        attemptRef.current = null;
        try { sessionStorage.removeItem(CHECKOUT_ATTEMPT_STORAGE_KEY); } catch { /* Retaining an old key is safer than creating another payment. */ }
      }
      const outcome = classifyCheckoutResponse(response.status, payload);
      if (outcome === "redirect") {
        trackEvent("add_payment_info", { item_count: count, value: payload.data.totalAmount });
        setMode("live");
        setPhase("redirecting");
        window.location.assign(payload.data.redirectUrl);
        return;
      }
      if (outcome === "preview") {
        setMode("preview");
        setPhase("form");
        return;
      }
      if (outcome === "pending") {
        setPhase("pending");
        return;
      }
      setPhase("error");
      setErrorMessage(outcome === "sold_out"
        ? "Stok salah satu item sedang habis. Muat ulang keranjang Anda dan coba ukuran lain."
        : outcome === "invalid"
          ? "Data checkout belum lengkap atau tidak valid. Periksa kembali isian Anda."
          : "Checkout gagal dibuat. Tidak ada pembayaran yang dibuat. Coba lagi beberapa saat.");
    } catch {
      // No HTTP response: the attempt key is kept so a retry dedupes at the
      // server even if the first request already created the payment.
      setPhase("pending");
    }
  };

  const busy = phase === "creating" || phase === "redirecting";

  return <div className="checkout-page">
    <header><span className="eyebrow">CHECKOUT</span><h1>Checkout</h1></header>
    <div className="checkout-grid">
      <section aria-label="Detail checkout">
        {mode === "preview" && <div className="checkout-status" role="status">
          <strong>Mode pembayaran demo sedang aktif.</strong>
          <p>Pesanan telah divalidasi, tetapi halaman pembayaran belum dibuat karena konfigurasi pembayaran produksi belum aktif.</p>
          {hasFlour && <PurchaseOptions productSlug="yubie-flour" productId="flour" placement="checkout" />}
        </div>}
        {phase === "pending" && <div className="checkout-status" role="status">
          <strong>Pembayaran Anda sedang kami pastikan.</strong>
          <p>Kami belum menerima kepastian dari penyedia pembayaran. Jangan membuat pesanan atau pembayaran kedua. Tombol di bawah melanjutkan percobaan yang sama.</p>
          <button className="button primary full" type="button" onClick={() => void submit()}>Cek status dan lanjutkan</button>
          <p>Butuh bantuan? Hubungi kami lewat WhatsApp.</p>
          <PurchaseOptions productSlug="yubie-flour" productId="flour" placement="checkout" />
        </div>}
        {mode !== "live" && phase !== "pending" && <form className="checkout-form" onSubmit={submit} noValidate>
          <fieldset>
            <legend>1 · Kontak</legend>
            <label>Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email" required aria-invalid={!form.email.includes("@")} />{phase !== "creating" && form.email.length > 3 && !form.email.includes("@") && <small>Masukkan email yang valid.</small>}</label>
            <p className="checkout-note">Sudah punya akun? <Link href="/login?next=/checkout">Lanjut dengan Google</Link> — atau lanjut sebagai tamu.</p>
          </fieldset>
          <fieldset>
            <legend>2 · Pengiriman</legend>
            <label>Nama penerima<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} autoComplete="name" /></label>
            <label>No. WhatsApp<input type="tel" inputMode="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} autoComplete="tel" required /></label>
            <label className="wide">Alamat lengkap<textarea rows={3} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} autoComplete="street-address" required /></label>
            <label>Kota<input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} autoComplete="address-level2" required /></label>
            <label>Kode pos<input value={form.postalCode} onChange={(event) => setForm({ ...form, postalCode: event.target.value })} inputMode="numeric" autoComplete="postal-code" /></label>
          </fieldset>
          <fieldset>
            <legend>3 · Pembayaran</legend>
            <p className="checkout-note">Anda akan diarahkan ke halaman pembayaran aman milik penyedia pembayaran untuk menyelesaikan transaksi.</p>
          </fieldset>
          {errorMessage && <p className="checkout-error" role="alert">{errorMessage}</p>}
          <button className="button primary full" type="submit" disabled={!formValid || busy}>
            {busy ? "Menyiapkan pembayaran…" : `Bayar ${formatRupiah(total)} →`}
          </button>
        </form>}
        {mode === "live" && <div className="checkout-status" role="status"><strong>Mengalihkan ke halaman pembayaran…</strong><p>Jika tidak terbuka otomatis, kembali ke halaman ini dan coba lagi.</p></div>}
      </section>
      <aside aria-label="Ringkasan pesanan">
        <span className="eyebrow">RINGKASAN PESANAN</span>
        {lines.map(({ line, product, size, lineTotal }) => <div key={`${line.productId}-${line.sizeId}`}><span>{product.name} · {size.label} × {line.quantity}</span><span>{formatRupiah(lineTotal)}</span></div>)}
        <div><span>Subtotal</span><span>{formatRupiah(subtotal)}</span></div>
        <form className="promo-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); applyPromo(String(data.get("promo") ?? "")); }}>
          <label htmlFor="checkout-promo">Kode promo</label>
          <div><input id="checkout-promo" name="promo" defaultValue={promoCode ?? ""} placeholder="Masukkan kode promo" autoCapitalize="characters" /><button type="submit">Terapkan</button></div>
        </form>
        {promotion && <div className="discount-row"><span>Promo {promotion.code} <button type="button" onClick={clearPromo}>Hapus</button></span><span>−{formatRupiah(promotion.discountAmount)}</span></div>}
        <div className="total"><span>Total</span><span>{formatRupiah(total)}</span></div>
        <p>Ongkir dan total final diverifikasi oleh server sebelum halaman pembayaran dibuat.</p>
        <Link className="button warm full" href="/cart">Kembali ke keranjang</Link>
      </aside>
    </div>
  </div>;
}
