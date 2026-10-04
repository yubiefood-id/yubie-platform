"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { Product } from "@/types/commerce";
import { formatRupiah } from "@/lib/format";
import { trackEvent } from "@/lib/analytics";
import { useCart } from "@/features/cart/cart-context";

/** Verified starting price: only available + verified products with priced
 *  sizes may show a price (PRODUCT_TRUTH_SOURCE.md render rule 1). */
function startingPrice(product: Product): number | null {
  if (product.status !== "available" || product.verificationStatus !== "verified") return null;
  const priced = product.sizes.filter((size) => size.available && typeof size.price === "number");
  return priced.length ? Math.min(...priced.map((size) => size.price ?? Number.POSITIVE_INFINITY)) : null;
}

export function ProductCard({ product, index }: { product: Product; index: number }) {
  const { addItem } = useCart();
  const price = startingPrice(product);
  const variants = product.sizes.filter((size) => size.available && typeof size.price === "number");
  const [sizeId, setSizeId] = useState(variants[0]?.id ?? "");
  const selected = variants.find((variant) => variant.id === sizeId) ?? variants[0];
  const trackCard = (source: string) => trackEvent("product_family_view", { product_id: product.id, source });

  return <article className={`product-card product-card-${index + 1}`}>
    <Link className="product-image" href={`/products/${product.slug}`} onClick={() => trackCard("product_card")}><Image src={product.image} alt={product.imageAlt} fill sizes="(max-width: 760px) 100vw, 40vw" unoptimized /></Link>
    <div className="product-meta">
      <span className="eyebrow">{product.positioning ?? product.eyebrow}</span>
      <h3><Link href={`/products/${product.slug}`} onClick={() => trackCard("product_card_title")}>{product.name}</Link></h3>
      <p>{product.descriptor}</p>
      <div className="product-pricing">{price !== null ? <><span className="availability-chip available">Tersedia</span><strong className="price-tag">Mulai {formatRupiah(price)}</strong></> : <span className="availability-chip coming">Belum tersedia</span>}</div>
      {selected && typeof selected.price === "number" ? <div className="product-quick-buy">
        <label><span className="sr-only">Pilih varian {product.name}</span><select value={selected.id} onChange={(event) => setSizeId(event.target.value)}>{variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.label} · {formatRupiah(variant.price ?? 0)}</option>)}</select></label>
        <button type="button" className="quick-add" onClick={() => addItem(product.id, selected.id, 1)}>Tambah</button>
      </div> : null}
      <div className="product-action"><Link href={`/products/${product.slug}`} onClick={() => trackCard("product_card_detail")}>Lihat detail produk <span>→</span></Link></div>
    </div>
  </article>;
}
