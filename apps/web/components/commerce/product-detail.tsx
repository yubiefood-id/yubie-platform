"use client";

import Image from "next/image";
import { useState } from "react";
import type { Product } from "@/types/commerce";
import { useCart } from "@/features/cart/cart-context";
import { formatRupiah } from "@/lib/format";

export function ProductDetail({ product }: { product: Product }) {
  const [sizeId, setSizeId] = useState(product.sizes[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const { addItem } = useCart();
  const size = product.sizes.find((item) => item.id === sizeId);
  const add = () => size?.price && addItem({ id: `${product.id}-${size.id}`, productId: product.id, name: product.name, sizeId: size.id, sizeLabel: size.label, unitPrice: size.price, image: product.image, quantity });
  return <>
    <section className="product-hero">
      <div className="product-detail-image"><Image src={product.image} alt={product.imageAlt} fill priority sizes="(max-width: 800px) 100vw, 55vw" unoptimized /></div>
      <div className="product-detail-copy"><span className="eyebrow">{product.eyebrow}</span><h1>{product.name}</h1><p className="descriptor">{product.descriptor}</p><p className="product-story">{product.story}</p>
        {product.status === "available" ? <>
          <fieldset className="option-set"><legend>Pilih ukuran</legend><div>{product.sizes.map((item) => <button className={sizeId === item.id ? "selected" : ""} key={item.id} onClick={() => setSizeId(item.id)}><span>{item.label}</span><small>{formatRupiah(item.price!)}</small></button>)}</div></fieldset>
          <div className="purchase-row"><div className="quantity-control"><button onClick={() => setQuantity(Math.max(1, quantity - 1))} aria-label="Kurangi kuantitas">−</button><span>{quantity}</span><button onClick={() => setQuantity(Math.min(20, quantity + 1))} aria-label="Tambah kuantitas">+</button></div><button className="button primary" onClick={add}>Add to Cart <span>{size?.price ? formatRupiah(size.price * quantity) : ""}</span></button></div>
        </> : <div className="coming-panel"><strong>Coming Soon</strong><p>Produk ini masih dalam tahap persiapan. Daftar untuk menerima kabar saat siap.</p><a className="button primary" href="#notify">Notify me <span>→</span></a></div>}
        <div className="product-facts"><details open><summary>Bagaimana menggunakannya?</summary><p>{product.status === "available" ? "Dikembangkan untuk eksplorasi baking dan kreasi makanan sehari-hari. Sesuaikan formula resep secara bertahap untuk hasil terbaik." : "Panduan persiapan lengkap akan diterbitkan setelah spesifikasi produk final terverifikasi."}</p></details><details><summary>Ingredients & nutrition</summary><p>Nutrition facts, ingredients, shelf life, certifications, allergen statements, and regulated claims require final verification before publication.</p></details><details><summary>Shipping & returns</summary><p>Informasi pengiriman akan dikonfirmasi ketika kanal commerce resmi diluncurkan.</p></details></div>
      </div>
    </section>
    {product.status === "coming-soon" && <section className="notify-strip section" id="notify"><span className="eyebrow">BE FIRST TO KNOW</span><h2>{product.name} is taking root.</h2><form onSubmit={(event) => event.preventDefault()}><label><span className="sr-only">Email</span><input type="email" required placeholder="you@example.com" /></label><button className="button gold">Notify me →</button></form><small>Form preview — delivery integration will be connected at launch.</small></section>}
  </>;
}
