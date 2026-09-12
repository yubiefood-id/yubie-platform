"use client";

import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/types/commerce";
import { useCart } from "@/features/cart/cart-context";
import { formatRupiah } from "@/lib/format";
import { trackEvent } from "@/lib/analytics";

export function ProductCard({ product, index }: { product: Product; index: number }) {
  const { addItem } = useCart();
  const firstSize = product.sizes[0];
  return <article className={`product-card product-card-${index + 1}`}>
    <Link className="product-image" href={`/products/${product.slug}`} onClick={() => trackEvent("product_family_view", { product_id: product.id, source: "product_card" })}><Image src={product.image} alt={product.imageAlt} fill sizes="(max-width: 760px) 100vw, 40vw" unoptimized /></Link>
    <div className="product-meta"><span className="eyebrow">{product.positioning ?? product.eyebrow}</span><h3><Link href={`/products/${product.slug}`} onClick={() => trackEvent("product_family_view", { product_id: product.id, source: "product_card_title" })}>{product.name}</Link></h3><p>{product.descriptor}</p>
      <div className="product-action">{product.status === "available" && firstSize ? <><strong>Ubi Ungu · mulai {formatRupiah(firstSize.price!)}</strong><button onClick={() => { addItem({ id: `${product.id}-ubi-ungu-${firstSize.id}`, productId: product.id, name: `${product.name} · Ubi Ungu`, sizeId: firstSize.id, sizeLabel: firstSize.label, unitPrice: firstSize.price!, image: product.image }); trackEvent("add_to_cart", { product_id: product.id, root_id: "ubi-ungu", size_id: firstSize.id, source: "quick_add" }); }}>Quick add <span>＋</span></button></> : <><strong>Coming Soon</strong><Link href={`/products/${product.slug}`}>Join waitlist <span>→</span></Link></>}</div>
    </div>
  </article>;
}
