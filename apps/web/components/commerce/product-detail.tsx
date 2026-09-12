"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { foodApplications, productRootOfferings, recipes, rootVarieties, type Product } from "@yubie/domain";
import { ProductWaitlistForm } from "@/components/forms/product-waitlist-form";
import { useCart } from "@/features/cart/cart-context";
import { trackEvent } from "@/lib/analytics";
import { formatRupiah } from "@/lib/format";

export function ProductDetail({ product }: { product: Product }) {
  useEffect(() => { trackEvent("product_family_view", { product_id: product.id, source: "product_detail" }); }, [product.id]);
  if (product.id === "flour") return <FlourProductDetail product={product} />;
  return <ComingSoonProductDetail product={product} />;
}

function FlourProductDetail({ product }: { product: Product }) {
  const [rootId, setRootId] = useState("ubi-ungu");
  const [sizeId, setSizeId] = useState(product.sizes[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const { addItem } = useCart();
  const root = rootVarieties.find((item) => item.id === rootId) ?? rootVarieties[0];
  const offering = productRootOfferings.find((item) => item.productId === product.id && item.rootId === root.id);
  const availableSizes = product.sizes.filter((size) => offering?.sizeIds.includes(size.id) && size.available && typeof size.price === "number");
  const size = availableSizes.find((item) => item.id === sizeId) ?? availableSizes[0];
  const applications = root.bestApplicationIds.map((id) => foodApplications.find((item) => item.id === id)).filter(Boolean);
  const relatedRecipes = recipes.filter((recipe) => recipe.productIds.includes(product.id) && recipe.rootIds.includes(root.id));

  const selectRoot = (id: string, index?: number) => {
    setRootId(id);
    const nextOffering = productRootOfferings.find((item) => item.productId === product.id && item.rootId === id);
    setSizeId(nextOffering?.sizeIds[0] ?? "");
    trackEvent("product_variant_select", { product_id: product.id, root_id: id });
    if (typeof index === "number") tabs.current[index]?.focus();
  };

  const onRootKeyDown = (index: number, event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!(["ArrowLeft", "ArrowRight", "Home", "End"] as string[]).includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? rootVarieties.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + rootVarieties.length) % rootVarieties.length;
    selectRoot(rootVarieties[next].id, next);
  };

  const add = () => {
    if (!size?.price || offering?.status !== "available") return;
    addItem({ id: `${product.id}-${root.id}-${size.id}`, productId: product.id, name: `${product.name} · ${root.name}`, sizeId: size.id, sizeLabel: size.label, unitPrice: size.price, image: product.image, quantity });
    trackEvent("add_to_cart", { product_id: product.id, root_id: root.id, size_id: size.id, quantity });
  };

  return <>
    <section className="product-hero flour-detail">
      <div className="product-detail-image"><Image src={product.image} alt={product.imageAlt} fill priority sizes="(max-width: 800px) 100vw, 55vw" unoptimized /></div>
      <div className="product-detail-copy"><span className="eyebrow">{product.positioning}</span><h1>YUBIE FLOUR</h1><p className="descriptor">{product.descriptor}</p><p className="product-story">{product.story}</p>
        <fieldset className="root-option-set"><legend>Choose your root</legend><div role="tablist" aria-label="Pilih varietas Yubie Flour">{rootVarieties.map((item, index) => <button ref={(element) => { tabs.current[index] = element; }} key={item.id} role="tab" aria-selected={root.id === item.id} tabIndex={root.id === item.id ? 0 : -1} onClick={() => selectRoot(item.id)} onKeyDown={(event) => onRootKeyDown(index, event)}><span style={{ background: item.colourHex }} aria-hidden="true" />{item.name}</button>)}</div></fieldset>
        <div className="selected-root" role="status" aria-live="polite"><span className="eyebrow">{root.colour}</span><h2>{root.name}</h2><p>{root.sensoryCharacter}</p><small>{root.textureCharacter}</small><b>{applications.map((item) => item?.name).join(" · ")}</b></div>
        {offering?.status === "available" ? <>
          <fieldset className="option-set"><legend>Pilih ukuran</legend><div>{availableSizes.map((item) => <button className={size?.id === item.id ? "selected" : ""} key={item.id} onClick={() => { setSizeId(item.id); trackEvent("product_variant_select", { product_id: product.id, root_id: root.id, size_id: item.id }); }}><span>{item.label}</span><small>{formatRupiah(item.price!)}</small></button>)}</div></fieldset>
          <div className="purchase-row"><div className="quantity-control"><button onClick={() => setQuantity(Math.max(1, quantity - 1))} aria-label="Kurangi kuantitas">−</button><span>{quantity}</span><button onClick={() => setQuantity(Math.min(20, quantity + 1))} aria-label="Tambah kuantitas">+</button></div><button className="button primary" onClick={add}>Add to Cart <span>{size?.price ? formatRupiah(size.price * quantity) : ""}</span></button></div>
        </> : <div className="availability-panel"><strong>{offering?.status === "b2b-only" ? "Available for B2B exploration" : "Not commercially available"}</strong><p>Belum ada size, harga, atau SKU publik yang disetujui untuk varietas ini.</p><Link className="button primary" href={`/b2b?interest=${product.id}&root=${root.id}#enquiry`} onClick={() => trackEvent("b2b_sample_click", { product_id: product.id, root_id: root.id })}>Request a B2B Sample <span>→</span></Link></div>}
      </div>
    </section>
    <section className="product-support-grid section"><article><span className="eyebrow">PRODUCT INFO</span><h2>For everyday creation.</h2><p>Gunakan Yubie Flour sebagai ingredient platform untuk baking, cooking, dan eksplorasi formulasi. Informasi ingredients, allergen, nutrition, shelf-life, dan sertifikasi tetap disembunyikan sampai verifikasi final.</p></article><article><span className="eyebrow">BEST APPLICATIONS</span><h2>{applications.map((item) => item?.name).join(" · ")}</h2><Link className="text-link" href={`/recipes?product=flour&root=${root.slug}`}>Explore matching recipes <span>→</span></Link></article><article><span className="eyebrow">B2B INGREDIENT</span><h2>From sample to product development.</h2><p>Diskusikan bulk ingredients, sampling, dan pengembangan produk dengan tim Yubie.</p><Link className="button gold" href={`/b2b?interest=flour&root=${root.id}#enquiry`} onClick={() => trackEvent("b2b_product_development_click", { product_id: product.id, root_id: root.id })}>Discuss Product Development <span>→</span></Link></article></section>
    {relatedRecipes.length > 0 && <section className="product-recipes section"><span className="eyebrow">MADE WITH {product.name.toUpperCase()} · {root.name.toUpperCase()}</span><h2>Recipe concepts for this root.</h2><div>{relatedRecipes.map((recipe) => <Link key={recipe.id} href={`/recipes/${recipe.slug}`}>{recipe.title}<span>→</span></Link>)}</div></section>}
  </>;
}

function ComingSoonProductDetail({ product }: { product: Product }) {
  const isShake = product.id === "shake";
  const steps = product.usageSteps ?? [];
  return <>
    <section className={`product-hero coming-product ${isShake ? "shake-detail" : "ppang-detail"}`}>
      <div className="product-detail-image"><Image src={product.image} alt={product.imageAlt} fill priority sizes="(max-width: 800px) 100vw, 55vw" unoptimized /></div>
      <div className="product-detail-copy"><span className="eyebrow">{product.positioning} · COMING SOON</span><h1>{product.name.toUpperCase()}</h1><p className="descriptor">{product.descriptor}</p><p className="product-story">{product.story}</p><div className="coming-panel"><strong>Coming Soon</strong><p>Belum ada harga, launch date, atau purchase action. Daftar hanya untuk kabar produk ini.</p><a className="button primary" href="#waitlist">Join product waitlist <span>→</span></a></div><div className="product-facts"><details open><summary>Product truth status</summary><p>Final ingredients, nutrition, allergen, storage, shelf-life, certification, and preparation specification remain pending approval.</p></details></div></div>
    </section>
    <section className="usage-section section"><span className="eyebrow">{isShake ? "SIMPLE PREPARATION" : "FROZEN FOR WHEN YOU WANT IT"}</span><h2>{isShake ? "POUR. ADD WATER. MIX." : "KEEP FROZEN. HEAT. ENJOY."}</h2><div>{steps.map((step, index) => <article key={step}><b>0{index + 1}</b><h3>{step}</h3><p>{isShake ? ["Buka format instan saat siap digunakan.", "Tambahkan air sesuai panduan final saat produk disetujui.", "Aduk hingga siap dinikmati."][index] : ["Simpan dalam kondisi frozen sesuai spesifikasi final.", "Panaskan mengikuti petunjuk terverifikasi pada produk final.", "Nikmati dalam porsi one-bite saat dibutuhkan."][index]}</p></article>)}</div></section>
    <section className="notify-strip section" id="waitlist"><span className="eyebrow">PRODUCT-SPECIFIC WAITLIST</span><h2>{product.name} is taking root.</h2><ProductWaitlistForm productId={product.id as "shake" | "ppang"} productName={product.name} /></section>
  </>;
}
