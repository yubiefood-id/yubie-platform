"use client";

import { useEffect, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { getApiOrigin } from "@/lib/api-origin";

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
