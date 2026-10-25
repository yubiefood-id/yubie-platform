"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/features/cart/cart-context";
import { getApiOrigin } from "@/lib/api-origin";
import { useFocusTrap } from "@/lib/a11y";
import { trackEvent } from "@/lib/analytics";
import { siteConfig } from "@/config/site";
import { ProductWaitlistForm } from "@/components/forms/product-waitlist-form";

const DISMISSED_KEY = "yubie.promo.dismissed.v1";

export function StorefrontWidgets() {
  const { openCart, count } = useCart();
  const [offer, setOffer] = useState<{ percentage: number } | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const pathname = usePathname();
  const hideOffer = /^\/(?:account|checkout|login)(?:\/|$)/.test(pathname);
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [whatsappHref, setWhatsappHref] = useState<string | null>(null);
  const [whatsappChecked, setWhatsappChecked] = useState(false);
  const whatsappRef = useRef<HTMLDivElement>(null);
  useFocusTrap(whatsappRef, whatsappOpen);

  useEffect(() => {
    if (hideOffer) return;
    const abort = new AbortController();
    // Session dismissal is read inside the promise chain so every setState
    // stays asynchronous; a dismissed session also skips the campaign fetch.
    Promise.resolve()
      .then(() => { try { return window.sessionStorage.getItem(DISMISSED_KEY) === "1"; } catch { return false; } })
      .then((alreadyDismissed) => {
        if (abort.signal.aborted) return;
        if (alreadyDismissed) { setDismissed(true); return; }
        fetch("/api/promotions/welcome", { cache: "no-store", signal: abort.signal }).then(async response => {
          const result = await response.json(), data = result.data;
          // An inactive or unreachable campaign removes the percentage claim
          // only — the phone waitlist sign-up itself always stays available.
          if (!abort.signal.aborted) setOffer(response.ok && result.ok && data?.available && typeof data.percentage === "number" && Number.isFinite(data.percentage) && data.percentage > 0 && data.percentage < 100 && Date.parse(data.endsAt) > Date.now() && !["not_eligible", "pending"].includes(data.eligibility) ? { percentage: data.percentage } : null);
        }).catch(() => { if (!abort.signal.aborted) setOffer(null); });
      });
    return () => abort.abort();
  }, [hideOffer, pathname]);

  useEffect(() => {
    if (!whatsappOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setWhatsappOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [whatsappOpen]);

  const closePromo = () => {
    setDismissed(true);
    try { window.sessionStorage.setItem(DISMISSED_KEY, "1"); } catch { /* Session-only dismissal remains available. */ }
  };

  const toggleWhatsapp = async () => {
    setWhatsappOpen((value) => !value);
    if (whatsappChecked) return;
    setWhatsappChecked(true);
    try {
      const response = await fetch("/api/purchase-options/yubie-flour");
      const payload = await response.json();
      const option = payload.data?.options?.find((item: { kind?: string; redirectPath?: string }) => item.kind === "whatsapp" && typeof item.redirectPath === "string");
      if (option?.redirectPath) setWhatsappHref(`${getApiOrigin()}${option.redirectPath}?source=floating_widget&placement=sitewide`);
    } catch {
      setWhatsappHref(null);
    }
  };

  return <>
    {!hideOffer && !dismissed && <aside className="welcome-offer" aria-label={offer ? "Promo pelanggan terverifikasi" : "Waitlist promo Yubie"}>
      <button className="icon-button" type="button" onClick={closePromo} aria-label="Tutup promo">×</button>
      {offer
        ? <h2>Promo {offer.percentage}% untuk pelanggan terverifikasi</h2>
        : <h2>Daftar &amp; dapatkan info promo Yubie</h2>}
      <ul className="offer-terms">
        <li>Verifikasi nomor HP kamu untuk melihat kelayakan promo.</li>
        <li>Join <a href={siteConfig.social.whatsappCommunity} target="_blank" rel="noopener noreferrer">komunitas WhatsApp Yubie</a>.</li>
      </ul>
      <ProductWaitlistForm productId="all" />
      <p className="offer-feedback">Sudah mencoba produk Yubie? <a href={siteConfig.social.feedbackForm} target="_blank" rel="noopener noreferrer" onClick={() => trackEvent("feedback_form_click", { target: "welcome-offer" })}>Isi formulir feedback</a></p>
      <Link className="text-button" href="/login?next=/account">Lihat kelayakan promo</Link>
    </aside>}

    <div className="whatsapp-widget">
      {whatsappOpen && <div ref={whatsappRef} className="whatsapp-panel" role="dialog" aria-modal="true" aria-label="Bantuan belanja via WhatsApp">
        <header><div className="whatsapp-avatar" aria-hidden="true">Y</div><div><strong>Yubie Care</strong><span>Assisted shopping</span></div><button type="button" onClick={() => setWhatsappOpen(false)} aria-label="Tutup WhatsApp">×</button></header>
        <div className="whatsapp-body"><p>Halo! Perlu bantuan memilih varian, mengecek pesanan, atau pembelian dalam jumlah besar?</p>{count > 0 && <button type="button" onClick={() => { setWhatsappOpen(false); openCart(); }}>Lihat {count} item di keranjang</button>}{whatsappHref ? <a className="whatsapp-cta" href={whatsappHref} target="_blank" rel="noreferrer">Lanjut ke WhatsApp resmi</a> : <small>Nomor WhatsApp resmi belum aktif di konfigurasi storefront. Kamu tetap bisa melihat produk di website resmi.</small>}</div>
      </div>}
      <button type="button" className="whatsapp-trigger" onClick={toggleWhatsapp} aria-expanded={whatsappOpen} aria-label="Chat Yubie — buka bantuan WhatsApp"><span aria-hidden="true">◔</span><b>Chat Yubie</b></button>
    </div>
  </>;
}
