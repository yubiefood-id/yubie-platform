"use client";

import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/types/commerce";
import { useCart } from "@/features/cart/cart-context";
import { formatRupiah } from "@/lib/format";

export function ProductCard({ product, index }: { product: Product; index: number }) {
  const { addItem } = useCart();
  const firstSize = product.sizes[0];
  return <article className={`product-card product-card-${index + 1}`}>
    <Link className="product-image" href={`/products/${product.slug}`}><Image src={product.image} alt={product.imageAlt} fill sizes="(max-width: 760px) 100vw, 40vw" unoptimized /></Link>
    <div className="product-meta"><span className="eyebrow">{product.eyebrow}</span><h3><Link href={`/products/${product.slug}`}>{product.name}</Link></h3><p>{product.descriptor}</p>
      <div className="product-action">{product.status === "available" && firstSize ? <><strong>Mulai {formatRupiah(firstSize.price!)}</strong><button onClick={() => addItem({ id: `${product.id}-${firstSize.id}`, productId: product.id, name: product.name, sizeId: firstSize.id, sizeLabel: firstSize.label, unitPrice: firstSize.price!, image: product.image })}>Quick add <span>＋</span></button></> : <><strong>Coming Soon</strong><Link href={`/products/${product.slug}`}>Notify me <span>→</span></Link></>}</div>
    </div>
  </article>;
}
