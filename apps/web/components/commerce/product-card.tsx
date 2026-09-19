"use client";

import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/types/commerce";
import { trackEvent } from "@/lib/analytics";

export function ProductCard({ product, index }: { product: Product; index: number }) {
  return <article className={`product-card product-card-${index + 1}`}>
    <Link className="product-image" href={`/products/${product.slug}`} onClick={() => trackEvent("product_family_view", { product_id: product.id, source: "product_card" })}><Image src={product.image} alt={product.imageAlt} fill sizes="(max-width: 760px) 100vw, 40vw" unoptimized /></Link>
    <div className="product-meta"><span className="eyebrow">{product.positioning ?? product.eyebrow}</span><h3><Link href={`/products/${product.slug}`} onClick={() => trackEvent("product_family_view", { product_id: product.id, source: "product_card_title" })}>{product.name}</Link></h3><p>{product.descriptor}</p>
      <div className="product-action">{product.status === "available" ? <><strong>Tersedia di marketplace partner</strong><Link className="button primary" href={`/products/${product.slug}`} onClick={() => trackEvent("marketplace_click", { product_id: product.id, placement: "shop_grid", source: "product_card" })}>Lihat opsi beli <span>→</span></Link></> : <><strong>Coming Soon</strong><Link href={`/products/${product.slug}`}>Join waitlist <span>→</span></Link></>}</div>
    </div>
  </article>;
}
