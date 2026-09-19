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
    return <div className="purchase-options empty" role="status"><strong>Belum tersedia di marketplace</strong><p>Tim Yubie sedang memverifikasi tautan beli resmi. Coba lagi nanti atau hubungi kami untuk pertanyaan produk.</p></div>;
  }

  const apiOrigin = getApiOrigin();

  return <div className={`purchase-options${compact ? " compact" : ""}`}>
    <span className="eyebrow">BELI RESMI</span>
    <p>Harga dan stok mengikuti marketplace partner. Yubie tidak memproses pembayaran di situs ini.</p>
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
