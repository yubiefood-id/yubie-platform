"use client";

import Link from "next/link";
import {useRouter} from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { PurchaseOptions } from "@/components/commerce/purchase-options";
import { DeliveryMap } from "@/components/delivery/delivery-map";
import { useCart, useCartDisplayLines } from "@/features/cart/cart-context";
import { trackEvent } from "@/lib/analytics";
import { formatRupiah } from "@/lib/format";
import { CHECKOUT_ATTEMPT_STORAGE_KEY, rememberRecoveredCheckout, storedAttemptForRequest, classifyCheckoutResponse, type HeldAttempt } from "@/lib/proxy-headers";

import {prepareCheckoutSession,timeoutSignal,withCheckoutLock,type CheckoutSessionReadiness} from "@/lib/checkout-session";
import { customerRequest } from "@/lib/customer-api";
import type { DeliveryMapPoint } from "@yubie/integrations/google-maps/browser";
type CheckoutPhase = "form" | "creating" | "redirecting" | "pending" | "unknown" | "exception" | "unavailable" | "stock_unavailable" | "error";
interface Quote {subtotalAmount:number;discountAmount:number;shippingAmount:number|null;totalAmount:number|null;stockAvailable:boolean;shippingAvailable:boolean}
/** ADR-014 courier delivery option: server-issued quote id is the ONLY thing
 *  the browser contributes; every amount shown here is display-only and
 *  re-derived server-side at payment-session creation. */
interface DeliveryOption {quoteId:string;courierCompany:string;courierName:string|null;courierServiceCode:string;courierServiceName:string|null;deliveryType:"now"|"scheduled";durationDescription:string|null;totalShippingIdr:number;providerAmountIdr:number;taxAmountIdr:number}
/** Server-side reverse-geocode preview: the structured parts are best-effort
 *  suggestions the customer may edit; nothing is submitted automatically. */
interface LocationPreview { label: string; latitude: number; longitude: number; address?: { province?: string; city?: string; district?: string; postalCode?: string } }

interface CheckoutFormState {
  email: string;
  name: string;
  phone: string;
  address: string;
  city: string;
  postalCode: string;
}

const EMPTY_FORM: CheckoutFormState = { email: "", name: "", phone: "", address: "", city: "", postalCode: "" };

/** Saved account address (subset) powering the checkout picker: the account
 *  side owns CRUD and the exactly-one-default invariant; checkout only reads. */
interface SavedAddress {
  id: string;
  isDefault: boolean;
  pin: { latitude: number; longitude: number } | null;
  address: { recipientName: string; recipientPhone: string; fullAddress: string; city: string; postalCode: string };
}

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
  // Free-shipping quick picks come from the server's active coverage; the
  // checkout quote stays the only authority on whether a city actually ships.
  const [coveredCities,setCoveredCities]=useState<string[]>([]);
  // Courier delivery options arrive only when free city coverage does not
  // cover the destination; selection resets whenever the cart or address changes.
  const [deliveryOptions,setDeliveryOptions]=useState<DeliveryOption[]|null>(null);
  const [selectedQuoteId,setSelectedQuoteId]=useState<string|null>(null);
  const [deliveryNote,setDeliveryNote]=useState<string|null>(null);
  const [locating,setLocating]=useState(false);
  const [locationNote,setLocationNote]=useState<string|null>(null);
  const [mapPoint,setMapPoint]=useState<DeliveryMapPoint|null>(null);
  // Address search (Places autocomplete) is the GPS alternative for customers
  // who decline the location permission; it degrades honestly when the
  // location service is not activated server-side.
  const [addressQuery,setAddressQuery]=useState("");
  const [suggestions,setSuggestions]=useState<{id:string;label:string}[]>([]);
  const [searchUnavailable,setSearchUnavailable]=useState(false);
  const placesSessionRef=useRef<string|null>(null);
  // Saved account addresses for logged-in customers (null = not loaded/guest).
  const [savedAddresses,setSavedAddresses]=useState<SavedAddress[]|null>(null);
  const [selectedAddressId,setSelectedAddressId]=useState<string|null>(null);
  const requestBody=JSON.stringify({lines:lines.map(({line})=>({productId:line.productId,sizeId:line.sizeId,quantity:line.quantity})),customerEmail:form.email.trim(),...(form.name.trim()?{customerName:form.name.trim()}:{}),delivery:{...(form.name.trim()?{name:form.name.trim()}:{}),phone:form.phone.trim(),address:form.address.trim(),city:form.city.trim(),...(form.postalCode.trim()?{postalCode:form.postalCode.trim()}:{})},...(promoCode?{promoCode}:{})});
  const formValid = form.email.includes("@") && form.phone.trim().length >= 8 && form.address.trim().length >= 8 && form.city.trim().length >= 2;
  const quote=quotation?.body===requestBody?quotation.value:null;
  const quoteError=quotation?.body===requestBody?quotation.error:null;
  const recover=useCallback(async()=>{
    let attemptKey:string|null=null;
    try{const held=JSON.parse(localStorage.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY)??"null");if(typeof held?.key==="string")attemptKey=held.key;}catch{/* Server-owned current attempt is still recoverable. */}
    const response=await fetch("/api/checkout/current",{headers:attemptKey?{"idempotency-key":attemptKey}:{},cache:"no-store",signal:timeoutSignal(10000)});const body=await response.json();
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
    // Every coverage field is untrusted JSON: normalize through explicit type
    // guards so no `any` escapes Array.isArray's unknown->any[] narrowing.
    const asRecord=(value:unknown):Record<string,unknown>|null=>typeof value==="object"&&value!==null&&!Array.isArray(value)?value as Record<string,unknown>:null;
    const cityList=(value:unknown):string[]=>Array.isArray(value)?value.filter((entry):entry is string=>typeof entry==="string"&&entry.trim().length>=2&&entry.trim().length<=80):[];
    const policyCities=(value:unknown):string[]=>{
      if(typeof value!=="object"||value===null||!("cities" in value))return[];
      return cityList(value.cities);
    };
    fetch("/api/shipping/coverage",{cache:"no-store"}).then(async response=>{
      if(!active||!response.ok)return;
      const body=asRecord(await response.json().catch(()=>null));
      const data=asRecord(body&&body.ok===true?body.data:null);
      const rawPolicies=data?.policies;
      const policies:unknown[]=Array.isArray(rawPolicies)?rawPolicies:[];
      if(active)setCoveredCities(policies.flatMap(policyCities).slice(0,20));
    }).catch(()=>{/* Manual entry stays fully available. */});
    return()=>{active=false;};
  },[]);
  /** Canonicalize a provider city to the exact approved coverage string so the
   *  dropdown always receives a selectable value; unmatched cities keep the
   *  provider spelling and surface through the "Kota lain…" path below. */
  const coveredCitiesRef=useRef<string[]>([]);
  useEffect(()=>{coveredCitiesRef.current=coveredCities;},[coveredCities]);
  const canonicalCity=useCallback((city:string|undefined):string|null=>{
    const trimmed=city?.trim();
    if(!trimmed)return null;
    return coveredCitiesRef.current.find((covered)=>covered.toLowerCase()===trimmed.toLowerCase())??trimmed;
  },[]);
  /** Shared location fill for GPS, pin moves, and address-search picks: fills
   *  editable suggestions only (never blanks existing input), shows the pin,
   *  and reports what was filled. Nothing is ever submitted automatically. */
  const fillFromLocation=useCallback((preview:LocationPreview,note:string|null)=>{
    setForm(form=>{
      const city=canonicalCity(preview.address?.city);
      return {...form,address:preview.label?.trim()||form.address,...(city?{city}:{}),...(preview.address?.postalCode?.trim()?{postalCode:preview.address.postalCode.trim()}:{})};
    });
    setMapPoint({latitude:preview.latitude,longitude:preview.longitude});
    if(note!==null)setLocationNote(note);
  },[canonicalCity]);
  /** Geolocation → server reverse-geocode → fill editable address suggestions. */
  const applyLocationPreview=useCallback(async(preview:LocationPreview|null,accuracyMeters?:number)=>{
    if(!preview){setLocationNote("Lokasi belum dapat dikenali. Isi alamat manual tetap bisa.");return;}
    fillFromLocation(preview,`Lokasi terdeteksi${typeof accuracyMeters==="number"&&Number.isFinite(accuracyMeters)?` (±${Math.round(accuracyMeters)} m)`:""}. Alamat, kota, dan kode pos sudah diisi — periksa kembali.`);
  },[fillFromLocation]);
  const activateLocation=useCallback(async()=>{
    setLocationNote(null);
    if(locating)return;
    if(typeof navigator==="undefined"||!navigator.geolocation){setLocationNote("Perangkat tidak mendukung deteksi lokasi.");return;}
    setLocating(true);
    navigator.geolocation.getCurrentPosition(async position=>{
      try{
        const preview=await customerRequest<LocationPreview|null>("/api/locations/reverse-geocode","POST",{latitude:position.coords.latitude,longitude:position.coords.longitude});
        await applyLocationPreview(preview,position.coords.accuracy);
      }catch{
        setLocationNote("Lokasi belum dapat dikenali. Isi alamat manual tetap bisa.");
      }finally{setLocating(false);}
    },()=>{setLocating(false);setLocationNote("Izin lokasi ditolak. Isi alamat manual tetap bisa.");},{enableHighAccuracy:true,timeout:8000,maximumAge:0});
  },[applyLocationPreview,locating]);
  const moveMapPin=useCallback(async(point:DeliveryMapPoint)=>{
    setMapPoint(point);
    try{
      const preview=await customerRequest<LocationPreview|null>("/api/locations/reverse-geocode","POST",{latitude:point.latitude,longitude:point.longitude});
      if(preview)fillFromLocation(preview,null);
    }catch{/* Pin moves keep the last recognized address; manual edit remains. */}
  },[fillFromLocation]);
  /** Places autocomplete search: the GPS alternative for customers who decline
   *  the location permission. One Places session (UUID) spans
   *  autocomplete→details and is retired after a pick. */
  const chooseSuggestion=useCallback(async(suggestion:{id:string;label:string})=>{
    setSuggestions([]);setAddressQuery(suggestion.label);
    try{
      const selection=await customerRequest<LocationPreview|null>("/api/locations/details","POST",{placeId:suggestion.id,sessionToken:placesSessionRef.current??crypto.randomUUID()});
      placesSessionRef.current=null;
      if(selection)fillFromLocation(selection,"Alamat terpilih dari pencarian. Alamat, kota, dan kode pos sudah diisi — periksa kembali.");
      else setLocationNote("Detail alamat belum dapat diambil. Isi alamat manual tetap bisa.");
    }catch{setLocationNote("Detail alamat belum dapat diambil. Isi alamat manual tetap bisa.");}
  },[fillFromLocation]);
  useEffect(()=>{
    if(searchUnavailable)return;
    const query=addressQuery.trim();
    // All state resets ride the async boundary (no synchronous setState inside
    // the effect body), matching the rates-effect pattern.
    let active=true;
    const timer=setTimeout(()=>{void (async()=>{
      if(query.length<3){if(active)setSuggestions([]);return;}
      try{
        placesSessionRef.current??=crypto.randomUUID();
        const result=await customerRequest<{id:string;label:string}[]>("/api/locations/autocomplete","POST",{query,sessionToken:placesSessionRef.current});
        if(active)setSuggestions(Array.isArray(result)?result.slice(0,5):[]);
      }catch{
        if(active){setSuggestions([]);setSearchUnavailable(true);}
      }
    })();},400);
    return()=>{active=false;clearTimeout(timer);};
  },[addressQuery,searchUnavailable]);
  /** Explicit saved-address pick: fills every delivery field (and drops the
   *  saved pin, if any) from one account record — the customer's one-tap full
   *  fill for logged-in users. Manual edits afterwards stay free-form. */
  const applySavedAddress=useCallback((row:SavedAddress)=>{
    setForm(form=>({...form,
      name:row.address.recipientName?.trim()||form.name,
      phone:row.address.recipientPhone?.trim()||form.phone,
      address:row.address.fullAddress?.trim()||form.address,
      city:canonicalCity(row.address.city)??form.city,
      postalCode:row.address.postalCode?.trim()||form.postalCode}));
    if(row.pin&&Number.isFinite(row.pin.latitude)&&Number.isFinite(row.pin.longitude))setMapPoint({latitude:row.pin.latitude,longitude:row.pin.longitude});
    setSelectedAddressId(row.id);
    setLocationNote("Alamat tersimpan dipilih. Periksa kembali lalu lanjutkan.");
  },[canonicalCity]);
  // Logged-in convenience: load saved addresses once; the DEFAULT address
  // auto-applies on load (fill-empty-only, so nothing typed is overwritten) —
  // "the account default is the checkout default until changed".
  useEffect(()=>{
    let active=true;
    void (async()=>{
      const response=await fetch("/api/auth/session",{cache:"no-store"}).catch(()=>null);
      const payload=await response?.json().catch(()=>null);
      if(!active||!response?.ok||payload?.data?.authenticated!==true)return;
      const addressesResponse=await fetch("/api/account/addresses",{cache:"no-store"}).catch(()=>null);
      const addressesPayload=await addressesResponse?.json().catch(()=>null);
      if(!active||!addressesResponse?.ok||addressesPayload?.ok!==true||!Array.isArray(addressesPayload.data))return;
      const rows=(addressesPayload.data as unknown[]).map((entry):SavedAddress|null=>{
        if(typeof entry!=="object"||entry===null)return null;
        const record=entry as Record<string,unknown>;
        const address=typeof record.address==="object"&&record.address!==null?record.address as Record<string,unknown>:null;
        const pin=typeof record.pin==="object"&&record.pin!==null?record.pin as Record<string,unknown>:null;
        const text=(value:unknown)=>typeof value==="string"?value.trim():"";
        if(typeof record.id!=="string"||!address)return null;
        const saved:SavedAddress={id:record.id,isDefault:record.isDefault===true,pin:null,
          address:{recipientName:text(address.recipientName),recipientPhone:text(address.recipientPhone),fullAddress:text(address.fullAddress),city:text(address.city),postalCode:text(address.postalCode)}};
        const latitude=Number(pin?.latitude),longitude=Number(pin?.longitude);
        if(Number.isFinite(latitude)&&Number.isFinite(longitude))saved.pin={latitude,longitude};
        return saved;
      }).filter((row):row is SavedAddress=>row!==null);
      if(!active||rows.length===0)return;
      setSavedAddresses(rows);
      const preferred=rows.find(row=>row.isDefault)??rows[0];
      if(!preferred)return;
      setForm(form=>({...form,
        ...(form.name.trim()===""&&preferred.address.recipientName?{name:preferred.address.recipientName}:{}),
        ...(form.phone.trim()===""&&preferred.address.recipientPhone?{phone:preferred.address.recipientPhone}:{}),
        ...(form.address.trim()===""&&preferred.address.fullAddress?{address:preferred.address.fullAddress}:{}),
        ...(form.city.trim()===""&&preferred.address.city?{city:canonicalCity(preferred.address.city)??preferred.address.city}:{}),
        ...(form.postalCode.trim()===""&&preferred.address.postalCode?{postalCode:preferred.address.postalCode}:{})}));
      setSelectedAddressId(preferred.id);
      if(preferred.pin)setMapPoint({latitude:preferred.pin.latitude,longitude:preferred.pin.longitude});
    })();
    return()=>{active=false;};
  },[canonicalCity]);
  useEffect(() => {
    let active=true;
    sessionReadyRef.current=withCheckoutLock(prepareCheckoutSession);
    void sessionReadyRef.current.then(async ready=>{
      if(!active)return;
      setAdmission(ready.ready?ready.admission:"unavailable");
      if(!ready.ready)return;
      // Recovery and the held-attempt inspection are best-effort: a transient
      // /current failure or blocked storage (iOS "Block All Cookie") must
      // never flip an already-resolved admission back to unavailable — the
      // form stays fillable and the pay button keeps its own honest gate.
      try{
        if(await recover())return;
        const held=localStorage.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY)??sessionStorage.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY);
        if(held){if(!localStorage.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY))localStorage.setItem(CHECKOUT_ATTEMPT_STORAGE_KEY,held);setPhase("unknown");}
      }catch{/* Automatic recovery is optional; manual checkout continues. */}
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
  // Fetch server courier rates only when the quote says the destination is not
  // free-covered: a paid provider call must never run per keystroke, and the
  // server reuses stored quotes while they stay valid. All state resets ride
  // the async boundary (no synchronous setState inside the effect).
  const cartLinesJson=JSON.stringify(lines.map(({line})=>({productId:line.productId,sizeId:line.sizeId,quantity:line.quantity})));
  const ratesGate=formValid&&lines.length>0&&form.postalCode.trim()!==""&&quote!==null&&!quote.shippingAvailable&&quote.stockAvailable;
  const ratesKey=`${ratesGate}|${cartLinesJson}|${form.phone.trim()}|${form.address.trim()}|${form.city.trim()}|${form.postalCode.trim()}`;
  useEffect(()=>{
    if(!ratesGate)return;
    const abort=new AbortController();
    const timer=setTimeout(()=>{void fetch("/api/shipping/rates",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({lines:JSON.parse(cartLinesJson),delivery:{phone:form.phone.trim(),address:form.address.trim(),city:form.city.trim(),postalCode:form.postalCode.trim()}}),cache:"no-store",signal:abort.signal}).then(async response=>{
      const result=await response.json();if(abort.signal.aborted)return;
      const shipping=result?.ok?result.data?.shipping:null;
      if(shipping?.mode==="courier"&&Array.isArray(shipping.options)&&shipping.options.length>0){
        setDeliveryOptions(shipping.options);setSelectedQuoteId(shipping.options[0].quoteId);setDeliveryNote(null);
      }else{setDeliveryOptions([]);setSelectedQuoteId(null);setDeliveryNote(shipping?.reason==="missing_postal_code"?"Kode pos diperlukan untuk menghitung ongkir.":"Belum ada layanan kurir untuk alamat ini.");}
    }).catch(()=>{if(!abort.signal.aborted){setDeliveryOptions([]);setSelectedQuoteId(null);setDeliveryNote("Opsi pengiriman belum dapat diperoleh.");}});},300);
    return()=>{abort.abort();clearTimeout(timer);};
  },[ratesKey,ratesGate,cartLinesJson,form.phone,form.address,form.city,form.postalCode]);

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
  const selectedOption=selectedQuoteId&&deliveryOptions?deliveryOptions.find(option=>option.quoteId===selectedQuoteId)??null:null;
  const courierShippingIdr=selectedOption?selectedOption.totalShippingIdr:null;
  const canPay=admission==="enabled"&&!!quote?.stockAvailable&&(!!quote?.shippingAvailable||courierShippingIdr!==null)&&(typeof quote?.totalAmount==="number"||courierShippingIdr!==null);
  const displayShipping=quote?.shippingAvailable?quote.shippingAmount:courierShippingIdr;
  const total=quote?(quote.totalAmount??(courierShippingIdr!==null?subtotal-(quote.discountAmount??0)+courierShippingIdr:null)):null;
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
        const response=await fetch("/api/checkout",{method:"POST",headers:{"content-type":"application/json","idempotency-key":attempt.key},body:JSON.stringify({...JSON.parse(requestBody),...(selectedQuoteId?{shippingQuoteId:selectedQuoteId}:{})}),cache:"no-store",signal:timeoutSignal(20000)});
        const payload=await response.json().catch(()=>null);const outcome=classifyCheckoutResponse(response.status,payload);
        if(outcome==="redirect"){
          if(typeof payload.data.checkoutToken==="string")localStorage.setItem(CHECKOUT_ATTEMPT_STORAGE_KEY,JSON.stringify({...attempt,checkoutToken:payload.data.checkoutToken}));
          trackEvent("add_payment_info",{item_count:count,value:payload.data.totalAmount});setMode("live");setPhase("redirecting");window.location.assign(payload.data.redirectUrl);return;
        }
        if(outcome==="pending"){setPhase("unknown");return;}
        if(outcome==="unavailable"){localStorage.removeItem(CHECKOUT_ATTEMPT_STORAGE_KEY);setPhase("unavailable");setAdmission("disabled");return;}
        if(outcome==="preview"){localStorage.removeItem(CHECKOUT_ATTEMPT_STORAGE_KEY);setMode("preview");setPhase("form");return;}
        if(outcome==="quote_stale"){
          localStorage.removeItem(CHECKOUT_ATTEMPT_STORAGE_KEY);setPhase("form");
          setSelectedQuoteId(null);setDeliveryOptions(null);
          setErrorMessage("Opsi pengiriman sudah berubah. Silakan pilih ulang layanan kurir lalu bayar lagi.");return;
        }
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
  // Maps-first: there is NO manual city field. The city is filled by GPS, the
  // address search, or a saved account address (canonicalized onto the exact
  // approved coverage string); the free-ongkir hint below reflects it.
  const coveredCityMatch = coveredCities.find((city) => city.toLowerCase() === form.city.trim().toLowerCase()) ?? null;

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
          {/* Typing is never gated on admission: on browsers where the session
              probe fails (no Web Locks/AbortSignal.timeout on iOS <16.4, blocked
              storage, flaky mobile network) the customer can still fill the
              form; only the pay button below carries the admission gate. */}
          <fieldset disabled={busy}>
            <legend>1 · Kontak</legend>
            <label>Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email" required aria-invalid={!form.email.includes("@")} />{phase !== "creating" && form.email.length > 3 && !form.email.includes("@") && <small>Masukkan email yang valid.</small>}</label>
            <p className="checkout-note">Sudah punya akun? <Link href="/login?next=/checkout">Lanjut dengan Google</Link> — atau lanjut sebagai tamu.</p>
          </fieldset>
          <fieldset disabled={busy}>
            <legend>2 · Pengiriman</legend>
            {savedAddresses!==null&&savedAddresses.length>0&&<div className="saved-addresses">
              <span className="checkout-note strong">Alamat tersimpan</span>
              <ul className="address-list saved-address-list">
                {savedAddresses.map(row=><li key={row.id} className={selectedAddressId===row.id?"selected":""}>
                  <button type="button" className="saved-address-option" aria-pressed={selectedAddressId===row.id} onClick={()=>applySavedAddress(row)}>
                    <span className="saved-address-label">{row.address.fullAddress}<span className="address-default">{row.isDefault?"Utama":null}</span></span>
                    <span className="saved-address-meta">{row.address.recipientName} · {row.address.city} {row.address.postalCode}</span>
                  </button>
                </li>)}
              </ul>
            </div>}
            <label>Nama penerima<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} autoComplete="name" /></label>
            <label>No. WhatsApp<input type="tel" inputMode="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} autoComplete="tel" required /></label>
            <button type="button" className="button warm location-activate" onClick={()=>void activateLocation()} disabled={locating||busy}>{locating?"Mendeteksi lokasi…":"📍 Aktifkan lokasi saya"}</button>
            {locationNote&&<p className="checkout-note" role="status">{locationNote}</p>}
            {!searchUnavailable
              ? <div className="address-search">
                  <input value={addressQuery} onChange={(event)=>setAddressQuery(event.target.value)} placeholder="Cari alamat (mis. Jl. Raya Cibinong)…" aria-label="Cari alamat pengiriman" autoComplete="off" onKeyDown={(event)=>{
                    if(event.key==="Enter"){event.preventDefault();if(suggestions[0])void chooseSuggestion(suggestions[0]);}
                    else if(event.key==="Escape"){setSuggestions([]);setAddressQuery("");}
                  }} />
                  {suggestions.length>0&&<ul className="address-suggestions" role="listbox" aria-label="Saran alamat">
                    {suggestions.map(suggestion=><li key={suggestion.id} role="option" aria-selected={false}><button type="button" onClick={()=>void chooseSuggestion(suggestion)}>{suggestion.label}</button></li>)}
                  </ul>}
                </div>
              : <p className="checkout-note" role="status">Layanan pencarian alamat belum aktif. Gunakan tombol lokasi di atas atau isi alamat manual.</p>}
            {mapPoint&&<DeliveryMap point={mapPoint} onChange={(point)=>void moveMapPin(point)} />}
            <label className="wide">Alamat lengkap<textarea rows={3} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} autoComplete="street-address" required /></label>
            <label>Kode pos<input value={form.postalCode} onChange={(event) => setForm({ ...form, postalCode: event.target.value })} inputMode="numeric" autoComplete="postal-code" /></label>
            {/* No manual city field: the city arrives from GPS, address search,
                or a saved address; free/courier pricing is derived server-side. */}
            <small className="city-hint wide" role="status">
              {form.city.trim()===""
                ? "Kota pengiriman terisi otomatis dari lokasi, pencarian alamat, atau alamat tersimpan di atas."
                : coveredCityMatch
                  ? `🚚 Gratis ongkir — pengiriman ke ${coveredCityMatch} gratis (Rp0) dan sudah termasuk dalam total.`
                  : coveredCities.length===0
                    ? "Gratis ongkir berlaku untuk kota tertentu — ketersediaan diverifikasi otomatis dari alamat Anda."
                    : `Gratis ongkir (Rp0) saat ini tersedia untuk: ${coveredCities.join(", ")}. Di luar area itu, ongkir kurir dihitung otomatis dari alamat lengkap.`}
            </small>
            {deliveryOptions!==null&&deliveryOptions.length>0&&<div className="courier-options" role="radiogroup" aria-label="Pilihan layanan kurir">
              {deliveryOptions.map(option=><label key={option.quoteId} className="courier-option">
                <input type="radio" name="yubie-courier" checked={selectedQuoteId===option.quoteId} onChange={()=>setSelectedQuoteId(option.quoteId)} />
                <span className="courier-name">{option.courierServiceName??option.courierServiceCode}{option.courierCompany?` · ${option.courierCompany}`:""}</span>
                <span className="courier-eta">{option.durationDescription??(option.deliveryType==="now"?"Instan":"Terjadwal")}</span>
                <span className="courier-price">{formatRupiah(option.totalShippingIdr)}</span>
              </label>)}
            </div>}
            {deliveryOptions!==null&&deliveryOptions.length===0&&deliveryNote&&<p className="checkout-note" role="status">{deliveryNote}</p>}
          </fieldset>
          <fieldset disabled={busy}>
            <legend>3 · Pembayaran</legend>
            <p className="checkout-note">Anda akan diarahkan ke halaman pembayaran aman milik penyedia pembayaran untuk menyelesaikan transaksi.</p>
            <p className="checkout-note">Dengan melanjutkan pemesanan, Anda menyetujui <Link href="/terms">Syarat &amp; Ketentuan Yubie</Link> dan telah membaca <Link href="/privacy">Kebijakan Privasi</Link> serta <Link href="/refund-policy">Kebijakan Pengembalian Dana</Link>.</p>
          </fieldset>
          {(errorMessage||quoteError)&&<p className="checkout-error" role="alert">{errorMessage??quoteError}</p>}
          {quote&&!quote.stockAvailable&&<p role="status">Stok item belum tersedia atau belum terverifikasi.</p>}
          {quote&&!quote.shippingAvailable&&deliveryOptions!==null&&deliveryOptions.length===0&&<p role="status">Pengiriman ke tujuan ini belum disetujui.</p>}
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
        {displayShipping!==null&&displayShipping!==undefined&&<div><span>Ongkir</span><span>{displayShipping===0?"Gratis":formatRupiah(displayShipping)}</span></div>}
        <div className="total"><span>Total final</span><span>{total===null?"Belum tersedia":formatRupiah(total)}</span></div>
        {quote?.shippingAvailable&&quote.shippingAmount===0&&total!==null&&<p className="checkout-note free-shipping" role="status">🚚 Gratis ongkir ke {form.city.trim()} — termasuk dalam total.</p>}
        <p>Ongkir dan total final diverifikasi oleh server sebelum halaman pembayaran dibuat.</p>
        <Link className="button warm full" href="/cart">Kembali ke keranjang</Link>
      </aside>
    </div>
  </div>;
}
