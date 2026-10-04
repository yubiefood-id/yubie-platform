"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { LAUNCH_PROMO_CODE, LAUNCH_PROMO_PERCENT } from "@yubie/domain";
import { useCart } from "@/features/cart/cart-context";
import { getApiOrigin } from "@/lib/api-origin";
import { useFocusTrap } from "@/lib/a11y";

const DISMISSED_KEY = "yubie.promo.dismissed.v1";

export function StorefrontWidgets() {
  const { applyPromo, openCart, count } = useCart();
  const [promoOpen, setPromoOpen] = useState(false);
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [whatsappHref, setWhatsappHref] = useState<string | null>(null);
  const [whatsappChecked, setWhatsappChecked] = useState(false);
  const promoRef = useRef<HTMLDivElement>(null);
  useFocusTrap(promoRef, promoOpen);

  useEffect(() => {
    let dismissed = false;
    try { dismissed = window.sessionStorage.getItem(DISMISSED_KEY) === "1"; } catch { dismissed = false; }
    if (dismissed) return;
    const timeout = window.setTimeout(() => setPromoOpen(true), 2200);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!promoOpen && !whatsappOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setPromoOpen(false); setWhatsappOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [promoOpen, whatsappOpen]);

  const closePromo = () => {
    setPromoOpen(false);
    try { window.sessionStorage.setItem(DISMISSED_KEY, "1"); } catch { /* session storage unavailable */ }
  };

  const claimPromo = () => {
    applyPromo(LAUNCH_PROMO_CODE);
    closePromo();
    openCart();
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
    {promoOpen && <div className="promo-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closePromo(); }}>
      <div className="promo-modal" ref={promoRef} role="dialog" aria-modal="true" aria-labelledby="promo-title">
        <button className="icon-button" type="button" onClick={closePromo} aria-label="Tutup promo">×</button>
        <div className="promo-visual"><Image src="/photography/context/lifestyle-breakfast.webp" alt="Sarapan dengan keluarga produk Yubie" fill sizes="(max-width: 640px) 100vw, 420px" unoptimized /></div>
        <div className="promo-copy"><span className="eyebrow">LAUNCH OFFER</span><h2 id="promo-title">{LAUNCH_PROMO_PERCENT}% untuk keranjang Yubie Anda.</h2><p>Gunakan kode <strong>{LAUNCH_PROMO_CODE}</strong>. Diskon dihitung ulang oleh server saat checkout.</p><button type="button" className="button primary full" onClick={claimPromo}>Pakai kode {LAUNCH_PROMO_CODE}</button><button type="button" className="text-link promo-later" onClick={closePromo}>Nanti saja</button></div>
      </div>
    </div>}

    <div className="whatsapp-widget">
      {whatsappOpen && <div className="whatsapp-panel" role="dialog" aria-label="Bantuan belanja via WhatsApp">
        <header><div className="whatsapp-avatar" aria-hidden="true">Y</div><div><strong>Yubie Care</strong><span>Assisted shopping</span></div><button type="button" onClick={() => setWhatsappOpen(false)} aria-label="Tutup WhatsApp">×</button></header>
        <div className="whatsapp-body"><p>Halo! Perlu bantuan memilih varian, mengecek pesanan, atau pembelian dalam jumlah besar?</p>{count > 0 && <button type="button" onClick={() => { setWhatsappOpen(false); openCart(); }}>Lihat {count} item di keranjang</button>}{whatsappHref ? <a className="whatsapp-cta" href={whatsappHref} target="_blank" rel="noreferrer">Lanjut ke WhatsApp resmi</a> : <small>Nomor WhatsApp resmi belum aktif di konfigurasi storefront. Anda tetap dapat menyelesaikan checkout online.</small>}</div>
      </div>}
      <button type="button" className="whatsapp-trigger" onClick={toggleWhatsapp} aria-expanded={whatsappOpen} aria-label="Buka bantuan WhatsApp"><span aria-hidden="true">◔</span><b>Chat Yubie</b></button>
    </div>
  </>;
}
