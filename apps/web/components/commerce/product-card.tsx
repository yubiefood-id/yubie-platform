"use client";

import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/types/commerce";
import { formatRupiah } from "@/lib/format";
import { trackEvent } from "@/lib/analytics";

/** Verified starting price: only available + verified products with priced
 *  sizes may show a price (PRODUCT_TRUTH_SOURCE.md render rule 1). */
function startingPrice(product: Product): number | null {
  if (product.status !== "available" || product.verificationStatus !== "verified") return null;
  const priced = product.sizes.filter((size) => size.available && typeof size.price === "number");
  return priced.length ? Math.min(...priced.map((size) => size.price ?? Number.POSITIVE_INFINITY)) : null;
}

export function ProductCard({ product, index }: { product: Product; index: number }) {
  const price = startingPrice(product);
  const awaitingVerification = product.status !== "available" && product.verificationStatus === "required";
  const trackCard = (source: string) => trackEvent("product_family_view", { product_id: product.id, source });

  return <article className={`product-card product-card-${index + 1}`}>
    <Link className="product-image" href={`/products/${product.slug}`} onClick={() => trackCard("product_card")}><Image src={product.image} alt={product.imageAlt} fill sizes="(max-width: 760px) 100vw, 40vw" unoptimized /></Link>
    <div className="product-meta">
      <span className="eyebrow">{product.positioning ?? product.eyebrow}</span>
      <h3><Link href={`/products/${product.slug}`} onClick={() => trackCard("product_card_title")}>{product.name}</Link></h3>
      <p>{product.descriptor}</p>
      <div className="product-pricing">
        {price !== null
          ? <><span className="availability-chip available">Tersedia</span><strong className="price-tag">Mulai {formatRupiah(price)}</strong></>
          : <span className="availability-chip coming">{awaitingVerification ? "Coming Soon · Menunggu Verifikasi" : "Coming Soon"}</span>}
      </div>
      <div className="product-action">{product.status === "available"
        ? <Link className="button primary" href={`/products/${product.slug}`} onClick={() => trackEvent("marketplace_click", { product_id: product.id, placement: "catalog_grid", source: "product_card" })}>Lihat opsi beli <span>→</span></Link>
        : <Link href={`/products/${product.slug}`}>Lihat detail & waitlist <span>→</span></Link>}
      </div>
    </div>
  </article>;
}
