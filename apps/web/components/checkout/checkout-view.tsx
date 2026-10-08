"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { quotePromotion } from "@yubie/domain";
import { PurchaseOptions } from "@/components/commerce/purchase-options";
import { useCart, useCartDisplayLines } from "@/features/cart/cart-context";
import { trackEvent } from "@/lib/analytics";
import { formatRupiah } from "@/lib/format";
import { nextAttemptKey } from "@/lib/proxy-headers";

type CheckoutPhase = "form" | "creating" | "redirecting" | "error";

interface CheckoutFormState {
  email: string;
  name: string;
  phone: string;
  address: string;
  city: string;
  postalCode: string;
}

const EMPTY_FORM: CheckoutFormState = { email: "", name: "", phone: "", address: "", city: "", postalCode: "" };

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
  // One logical checkout attempt = one idempotency key. The key survives a
  // network-ambiguous failure (fetch threw) so a retry dedupes at the server;
  // any definitive HTTP response closes the attempt.
  const attemptKeyRef = useRef<string | null>(null);

  useEffect(() => { if (hydrated && count > 0) trackEvent("begin_checkout", { item_count: count }); }, [hydrated, count]);

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

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!formValid || phase === "creating") return;
    setPhase("creating");
    setErrorMessage(null);
    const attemptKey = nextAttemptKey(attemptKeyRef.current, "ambiguous", crypto.randomUUID());
    attemptKeyRef.current = attemptKey;
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": attemptKey },
        body: JSON.stringify({
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
        }),
      });
      const payload = await response.json().catch(() => null);
      const data = payload?.data;
      // Any HTTP response is definitive: the server has decided this key's
      // fate, so the attempt closes (the next submit starts a fresh key).
      attemptKeyRef.current = nextAttemptKey(attemptKeyRef.current, "definitive", "");
      if (response.status === 201 && data?.mode === "live" && typeof data.redirectUrl === "string") {
        trackEvent("add_payment_info", { item_count: count, value: data.totalAmount });
        setMode("live");
        setPhase("redirecting");
        window.location.assign(data.redirectUrl);
        return;
      }
      if (response.ok && data?.status === "preview") {
        setMode("preview");
        setPhase("form");
        return;
      }
      setMode("preview");
      setPhase("error");
      const code = payload?.code;
      setErrorMessage(code === "INSUFFICIENT_INVENTORY" || code === "UNAVAILABLE_LINE"
        ? "Stok salah satu item sedang habis. Muat ulang keranjang Anda dan coba ukuran lain."
        : code === "PROVIDER_UNAVAILABLE" || code === "API_TIMEOUT"
          ? "Penyedia pembayaran sedang tidak dapat dihubungi. Coba lagi beberapa saat."
          : code === "IDEMPOTENCY_KEY_REUSED"
            ? "Permintaan sebelumnya masih diproses. Tunggu sebentar lalu coba lagi."
            : "Checkout gagal dibuat. Coba lagi beberapa saat.");
    } catch {
      // Network-ambiguous: the attempt key is KEPT so the retry dedupes at
      // the server even if the first request already created the order.
      setMode("preview");
      setPhase("error");
      setErrorMessage("Koneksi ke server gagal. Coba lagi — pesanan Anda tidak akan terduplikasi.");
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
        {mode !== "live" && <form className="checkout-form" onSubmit={submit} noValidate>
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
          <div><input id="checkout-promo" name="promo" defaultValue={promoCode ?? ""} placeholder="YUBIE15" autoCapitalize="characters" /><button type="submit">Terapkan</button></div>
        </form>
        {promotion && <div className="discount-row"><span>Promo {promotion.code} <button type="button" onClick={clearPromo}>Hapus</button></span><span>−{formatRupiah(promotion.discountAmount)}</span></div>}
        <div className="total"><span>Total</span><span>{formatRupiah(total)}</span></div>
        <p>Ongkir dan total final diverifikasi oleh server sebelum halaman pembayaran Xendit dibuat.</p>
        <Link className="button warm full" href="/cart">Kembali ke keranjang</Link>
      </aside>
    </div>
  </div>;
}
