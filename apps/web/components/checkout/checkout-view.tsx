"use client";

import Link from "next/link";
import {useRouter} from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { PurchaseOptions } from "@/components/commerce/purchase-options";
import { useCart, useCartDisplayLines } from "@/features/cart/cart-context";
import { trackEvent } from "@/lib/analytics";
import { formatRupiah } from "@/lib/format";
import { CHECKOUT_ATTEMPT_STORAGE_KEY, rememberRecoveredCheckout, storedAttemptForRequest, classifyCheckoutResponse, type HeldAttempt } from "@/lib/proxy-headers";

import {prepareCheckoutSession,withCheckoutLock,type CheckoutSessionReadiness} from "@/lib/checkout-session";
type CheckoutPhase = "form" | "creating" | "redirecting" | "pending" | "unknown" | "exception" | "unavailable" | "stock_unavailable" | "error";
interface Quote {subtotalAmount:number;discountAmount:number;shippingAmount:number|null;totalAmount:number|null;stockAvailable:boolean;shippingAvailable:boolean}

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
  const router=useRouter();
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
  const sessionReadyRef = useRef<Promise<CheckoutSessionReadiness> | null>(null);
  const [admission,setAdmission]=useState<"loading"|"enabled"|"disabled"|"unavailable">("loading");
  const [quotation,setQuotation]=useState<{body:string;value:Quote|null;error:string|null}|null>(null);
  const requestBody=JSON.stringify({lines:lines.map(({line})=>({productId:line.productId,sizeId:line.sizeId,quantity:line.quantity})),customerEmail:form.email.trim(),...(form.name.trim()?{customerName:form.name.trim()}:{}),delivery:{...(form.name.trim()?{name:form.name.trim()}:{}),phone:form.phone.trim(),address:form.address.trim(),city:form.city.trim(),...(form.postalCode.trim()?{postalCode:form.postalCode.trim()}:{})},...(promoCode?{promoCode}:{})});
  const formValid = form.email.includes("@") && form.phone.trim().length >= 8 && form.address.trim().length >= 8 && form.city.trim().length >= 2;
  const quote=quotation?.body===requestBody?quotation.value:null;
  const quoteError=quotation?.body===requestBody?quotation.error:null;
  const canPay=admission==="enabled"&&!!quote?.stockAvailable&&!!quote?.shippingAvailable&&typeof quote?.totalAmount==="number";
  const recover=useCallback(async()=>{
    let attemptKey:string|null=null;
    try{const held=JSON.parse(localStorage.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY)??"null");if(typeof held?.key==="string")attemptKey=held.key;}catch{/* Server-owned current attempt is still recoverable. */}
    const response=await fetch("/api/checkout/current",{headers:attemptKey?{"idempotency-key":attemptKey}:{},cache:"no-store",signal:AbortSignal.timeout(10000)});const body=await response.json();
    if(!response.ok||!body.ok)throw new Error("Recovery unavailable");
    if(body.data?.checkoutToken){
      try{rememberRecoveredCheckout(localStorage,body.data.checkoutToken);}catch{/* Storage access must not block authoritative recovery. */}
      router.replace(`/checkout/success?checkout=${encodeURIComponent(body.data.checkoutToken)}`);return true;}
    if(body.data?.state==="reconciliation_exception"){setPhase("exception");return true;}
    return false;
  },[router]);

  useEffect(() => { if (hydrated && count > 0) trackEvent("begin_checkout", { item_count: count }); }, [hydrated, count]);
  useEffect(() => {
    let active=true;
    sessionReadyRef.current=withCheckoutLock(prepareCheckoutSession);
    void sessionReadyRef.current.then(async ready=>{
      if(!active)return;
      setAdmission(ready.ready?ready.admission:"unavailable");
      if(!ready.ready)return;
      if(await recover())return;
      const held=localStorage.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY)??sessionStorage.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY);
      if(held){if(!localStorage.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY))localStorage.setItem(CHECKOUT_ATTEMPT_STORAGE_KEY,held);setPhase("unknown");}
    }).catch(()=>{if(active)setAdmission("unavailable");});
    return()=>{active=false;};
  }, [recover]);
  useEffect(()=>{
    if(!formValid||!lines.length)return;
    const abort=new AbortController();
    const timer=setTimeout(()=>{void fetch("/api/checkout/quote",{method:"POST",headers:{"content-type":"application/json"},body:requestBody,cache:"no-store",signal:abort.signal}).then(async response=>{
      const result=await response.json();if(abort.signal.aborted)return;
      setQuotation({body:requestBody,value:response.ok&&result.ok?result.data:null,error:response.ok&&result.ok?null:"Harga, promo, atau pengiriman belum dapat diverifikasi."});
    }).catch(()=>{if(!abort.signal.aborted)setQuotation({body:requestBody,value:null,error:"Ringkasan checkout belum dapat diperoleh."});});},250);
    return()=>{abort.abort();clearTimeout(timer);};
  },[requestBody,formValid,lines.length]);

  if (!hydrated) return <div className="checkout-page" aria-busy="true"><p className="cart-loading">Memuat checkout…</p></div>;

  if (count === 0 || lines.length === 0) {
    return <div className="checkout-page empty-cart">
      <div className="slice-mark" aria-hidden="true">✦</div>
      <h1>Tidak ada yang bisa di-checkout.</h1>
      <p>Keranjang Anda kosong. Pilih produk Yubie terlebih dahulu.</p>
      <Link className="button primary" href="/products">Lihat produk <span>→</span></Link>
    </div>;
  }

  const subtotal = quote?.subtotalAmount??lines.reduce((sum,item)=>sum+item.lineTotal,0);
  const total=quote?.totalAmount??null;
  const hasFlour=lines.some(({line})=>line.productId==="flour");
  const submit=async(event?:React.FormEvent)=>{
    event?.preventDefault();if(!formValid||!canPay||phase==="creating"||phase==="redirecting")return;
    setPhase("creating");setErrorMessage(null);let submitted=false;
    try{
      const ready=await(sessionReadyRef.current??=withCheckoutLock(prepareCheckoutSession));
      if(!ready.ready||ready.admission!=="enabled"){setAdmission("disabled");setPhase("unavailable");return;}
      await withCheckoutLock(async()=>{
        if(await recover())return;
        if(localStorage.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY)){setPhase("unknown");return;}
        const attempt=await storedAttemptForRequest(localStorage,requestBody,crypto.randomUUID());attemptRef.current=attempt;
        submitted=true;
        const response=await fetch("/api/checkout",{method:"POST",headers:{"content-type":"application/json","idempotency-key":attempt.key},body:requestBody,cache:"no-store",signal:AbortSignal.timeout(20000)});
        const payload=await response.json().catch(()=>null);const outcome=classifyCheckoutResponse(response.status,payload);
        if(outcome==="redirect"){
          if(typeof payload.data.checkoutToken==="string")localStorage.setItem(CHECKOUT_ATTEMPT_STORAGE_KEY,JSON.stringify({...attempt,checkoutToken:payload.data.checkoutToken}));
          trackEvent("add_payment_info",{item_count:count,value:payload.data.totalAmount});setMode("live");setPhase("redirecting");window.location.assign(payload.data.redirectUrl);return;
        }
        if(outcome==="pending"){setPhase("unknown");return;}
        if(outcome==="unavailable"){localStorage.removeItem(CHECKOUT_ATTEMPT_STORAGE_KEY);setPhase("unavailable");setAdmission("disabled");return;}
        if(outcome==="preview"){localStorage.removeItem(CHECKOUT_ATTEMPT_STORAGE_KEY);setMode("preview");setPhase("form");return;}
        if(outcome==="sold_out"||outcome==="invalid"){
          if(!await recover())localStorage.removeItem(CHECKOUT_ATTEMPT_STORAGE_KEY);
          setPhase(outcome==="sold_out"?"stock_unavailable":"error");setErrorMessage(outcome==="sold_out"?"Stok item berubah. Keranjang tetap tersimpan; periksa varian dan jumlahnya.":"Data checkout belum valid. Periksa kembali isian Anda.");return;
        }
        setPhase("unknown");
      });
    }catch{
      setPhase(submitted||attemptRef.current?"unknown":"unavailable");
      if(!submitted&&!attemptRef.current)setErrorMessage("Sesi checkout belum dapat disiapkan. Pesanan belum dikirim.");
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
        {(admission==="disabled"||admission==="unavailable"||phase==="unavailable")&&<div className="checkout-status" role="status"><strong>Checkout belum tersedia.</strong><p>Pembayaran baru belum dibuka. Isi keranjang tetap tersimpan. Status pesanan yang sudah ada tetap dapat diperiksa.</p><button className="button warm" type="button" onClick={()=>window.location.reload()}>Periksa ketersediaan</button></div>}
        {phase==="exception"&&<div className="checkout-status" role="alert"><strong>Status pesanan perlu ditinjau.</strong><p>Jangan membuat pembayaran baru. Tim Yubie perlu merekonsiliasi percobaan yang sudah ada.</p></div>}
        {(phase === "pending"||phase==="unknown") && <div className="checkout-status" role="status">
          <strong>Status pembayaran belum dapat dipastikan.</strong>
          <p>Kami belum menerima kepastian dari penyedia pembayaran. Jangan membuat pesanan atau pembayaran kedua. Tombol di bawah melanjutkan percobaan yang sama.</p>
          <button className="button primary full" type="button" onClick={() => {void recover().catch(()=>setErrorMessage("Status belum dapat diperoleh. Jangan melakukan pembayaran kedua."));}}>Cek status</button>
          {errorMessage&&<p role="alert">{errorMessage}</p>}
          <PurchaseOptions productSlug="yubie-flour" productId="flour" placement="checkout" />
        </div>}
        {mode !== "live" && !["pending","unknown","exception"].includes(phase) && <form className="checkout-form" onSubmit={submit} noValidate>
          <fieldset disabled={admission!=="enabled"||busy}>
            <legend>1 · Kontak</legend>
            <label>Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email" required aria-invalid={!form.email.includes("@")} />{phase !== "creating" && form.email.length > 3 && !form.email.includes("@") && <small>Masukkan email yang valid.</small>}</label>
            <p className="checkout-note">Sudah punya akun? <Link href="/login?next=/checkout">Lanjut dengan Google</Link> — atau lanjut sebagai tamu.</p>
          </fieldset>
          <fieldset disabled={admission!=="enabled"||busy}>
            <legend>2 · Pengiriman</legend>
            <label>Nama penerima<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} autoComplete="name" /></label>
            <label>No. WhatsApp<input type="tel" inputMode="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} autoComplete="tel" required /></label>
            <label className="wide">Alamat lengkap<textarea rows={3} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} autoComplete="street-address" required /></label>
            <label>Kota<input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} autoComplete="address-level2" required /></label>
            <label>Kode pos<input value={form.postalCode} onChange={(event) => setForm({ ...form, postalCode: event.target.value })} inputMode="numeric" autoComplete="postal-code" /></label>
          </fieldset>
          <fieldset disabled={admission!=="enabled"||busy}>
            <legend>3 · Pembayaran</legend>
            <p className="checkout-note">Anda akan diarahkan ke halaman pembayaran aman milik penyedia pembayaran untuk menyelesaikan transaksi.</p>
          </fieldset>
          {(errorMessage||quoteError)&&<p className="checkout-error" role="alert">{errorMessage??quoteError}</p>}
          {quote&&!quote.stockAvailable&&<p role="status">Stok item belum tersedia atau belum terverifikasi.</p>}
          {quote&&!quote.shippingAvailable&&<p role="status">Pengiriman ke tujuan ini belum disetujui.</p>}
          <button className="button primary full" type="submit" disabled={!formValid || !canPay || busy}>
            {busy ? "Menyiapkan pembayaran…" : total===null?"Pembayaran belum tersedia":`Bayar ${formatRupiah(total)} →`}
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
        {!!quote?.discountAmount&&<div className="discount-row"><span>Diskon terverifikasi <button type="button" onClick={clearPromo}>Hapus</button></span><span>−{formatRupiah(quote.discountAmount)}</span></div>}
        <div className="total"><span>Total final</span><span>{total===null?"Belum tersedia":formatRupiah(total)}</span></div>
        <p>Ongkir dan total final diverifikasi oleh server sebelum halaman pembayaran dibuat.</p>
        <Link className="button warm full" href="/cart">Kembali ke keranjang</Link>
      </aside>
    </div>
  </div>;
}
