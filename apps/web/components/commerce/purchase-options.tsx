"use client";

import { useEffect, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { getApiOrigin } from "@/lib/api-origin";
import { directCommerce, launchProfile } from "@/config/launch";
import { siteConfig } from "@/config/site";
import manifest from "@/config/approved-marketplace-listings.json";
import type { MarketplaceListing } from "@yubie/domain";

type PurchaseOption =
  | { kind: "marketplace"; listingKey: string; marketplace: string; label: string; redirectPath: string; productId: string; skuId?: string }
  | { kind: "whatsapp"; intentKey: string; label: string; redirectPath: string; productId?: string; rootId?: string };

interface PurchaseOptionsProps {
  productSlug: string;
  productId: string;
  rootId?: string;
  placement?: string;
  compact?: boolean;
}

export function PurchaseOptions({ productSlug, productId, rootId, placement = "pdp", compact = false }: PurchaseOptionsProps) {
  if (!directCommerce) {
    const listings = launchProfile === "MARKETPLACE_MSP" ? (manifest.listings as MarketplaceListing[]).filter((listing) => listing.productId === productId && listing.status === "active") : [];
    return <div className="purchase-options">
      <span className="eyebrow">{listings.length ? "BELI DI KANAL RESMI" : "KATALOG PRODUK"}</span>
      <p>{listings.length ? "Transaksi dilakukan di marketplace. Harga, stok, pembayaran, pengiriman dan retur mengikuti toko resmi pada kanal tersebut." : "Pembelian langsung belum tersedia. Tautan toko hanya ditampilkan setelah mendapat persetujuan Yubie."}</p>
      <div className="purchase-option-list">{listings.map((listing) => <a className="button primary" key={listing.listingKey} href={listing.publicUrl} rel="noopener noreferrer" onClick={() => trackEvent("marketplace_click", { product_id: productId, listing_key: listing.listingKey, channel: listing.marketplace, placement })}>{listing.marketplace === "shopee" ? "Shopee" : "Tokopedia"} <span>↗</span></a>)}</div>
      <a className="text-link" href={`mailto:${siteConfig.email}`}>Hubungi Yubie <span>→</span></a>
    </div>;
  }
  return <RemotePurchaseOptions productSlug={productSlug} productId={productId} rootId={rootId} placement={placement} compact={compact} />;
}

function RemotePurchaseOptions({ productSlug, productId, rootId, placement = "pdp", compact = false }: PurchaseOptionsProps) {
  const [options, setOptions] = useState<PurchaseOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/purchase-options/${encodeURIComponent(productSlug)}`);
        if (!response.ok) throw new Error("fetch failed");
        const payload = await response.json();
        if (!cancelled) setOptions(payload.data?.options ?? []);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [productSlug]);

  if (loading) {
    return <div className="purchase-options" role="status"><p>Memuat opsi beli…</p></div>;
  }

  if (error || options.length === 0) {
    return <div className="purchase-options empty" role="status"><strong>Alternatif pembelian belum tersedia</strong><p>Anda tetap dapat menambahkan produk ke keranjang dan melanjutkan ke checkout. Tautan marketplace dan WhatsApp hanya ditampilkan setelah diverifikasi oleh tim Yubie.</p></div>;
  }

  const apiOrigin = getApiOrigin();

  return <div className={`purchase-options${compact ? " compact" : ""}`}>
    <span className="eyebrow">ALTERNATIF BELANJA</span>
    <p>Checkout langsung tersedia melalui keranjang. Anda juga dapat memilih kanal resmi berikut; harga dan stok di kanal partner dapat berbeda.</p>
    <div className="purchase-option-list">
      {options.map((option) => {
        const href = `${apiOrigin}${option.redirectPath}?source=product_detail&placement=${placement}${rootId ? `&rootId=${rootId}` : ""}&productId=${productId}`;
        const onClick = () => {
          if (option.kind === "marketplace") {
            trackEvent("marketplace_click", { product_id: productId, channel: option.marketplace, listing_key: option.listingKey, placement });
          } else {
            trackEvent("whatsapp_intent_click", { product_id: productId, placement });
          }
        };
        return <a key={option.kind === "marketplace" ? option.listingKey : option.intentKey} className="button primary" href={href} onClick={onClick} rel="noopener noreferrer">{option.label} <span>↗</span></a>;
      })}
    </div>
  </div>;
}
