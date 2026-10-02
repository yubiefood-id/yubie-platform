"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { foodApplications, productRootOfferings, recipes, rootVarieties, type Product } from "@yubie/domain";
import { ProductWaitlistForm } from "@/components/forms/product-waitlist-form";
import { PurchaseOptions } from "@/components/commerce/purchase-options";
import { BuyBox } from "@/components/commerce/pdp/buy-box";
import { trackEvent } from "@/lib/analytics";

const PENDING_FACT = "Informasi ini menunggu verifikasi final untuk SKU komersial dan akan diterbitkan setelah disetujui.";

export function ProductDetail({ product }: { product: Product }) {
  useEffect(() => { trackEvent("product_family_view", { product_id: product.id, source: "product_detail" }); }, [product.id]);
  if (product.id === "flour") return <FlourProductDetail product={product} />;
  return <ComingSoonProductDetail product={product} />;
}

function FlourProductDetail({ product }: { product: Product }) {
  const [rootId, setRootId] = useState("ubi-ungu");
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const root = rootVarieties.find((item) => item.id === rootId) ?? rootVarieties[0];
  const offering = productRootOfferings.find((item) => item.productId === product.id && item.rootId === root.id);
  const applications = root.bestApplicationIds.map((id) => foodApplications.find((item) => item.id === id)).filter(Boolean);
  const relatedRecipes = recipes.filter((recipe) => recipe.productIds.includes(product.id) && recipe.rootIds.includes(root.id));

  const selectRoot = (id: string, index?: number) => {
    setRootId(id);
    trackEvent("product_variant_select", { product_id: product.id, root_id: id });
    if (typeof index === "number") tabs.current[index]?.focus();
  };

  const onRootKeyDown = (index: number, event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!(["ArrowLeft", "ArrowRight", "Home", "End"] as string[]).includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? rootVarieties.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + rootVarieties.length) % rootVarieties.length;
    selectRoot(rootVarieties[next].id, next);
  };

  return <>
    <section className="product-hero flour-detail">
      <div className="product-detail-image"><Image src={product.image} alt={product.imageAlt} fill priority sizes="(max-width: 800px) 100vw, 55vw" unoptimized /></div>
      <div className="product-detail-copy">
        <span className="eyebrow">{product.positioning}</span><h1>YUBIE FLOUR</h1><p className="descriptor">{product.descriptor}</p><p className="product-story">{product.story}</p>
        <BuyBox product={product} />
        {offering?.status === "available"
          ? <PurchaseOptions productSlug={product.slug} productId={product.id} rootId={root.id} placement="pdp" />
          : <div className="availability-panel"><strong>{offering?.status === "b2b-only" ? "Available for B2B exploration" : "Not commercially available"}</strong><p>Belum ada size, harga, atau SKU publik yang disetujui untuk varietas ini.</p><Link className="button primary" href={`/b2b?intent=sample&interest=${product.id}&root=${root.id}#enquiry`} onClick={() => trackEvent("b2b_sample_click", { product_id: product.id, root_id: root.id })}>Minta sampel B2B <span>→</span></Link></div>}
        <fieldset className="root-option-set"><legend>Choose your root</legend><div role="tablist" aria-label="Pilih varietas Yubie Flour">{rootVarieties.map((item, index) => <button ref={(element) => { tabs.current[index] = element; }} key={item.id} id={`flour-root-tab-${item.id}`} role="tab" aria-selected={root.id === item.id} aria-controls="flour-root-panel" tabIndex={root.id === item.id ? 0 : -1} onClick={() => selectRoot(item.id)} onKeyDown={(event) => onRootKeyDown(index, event)}><span style={{ background: item.colourHex }} aria-hidden="true" />{item.name}</button>)}</div></fieldset>
        <div id="flour-root-panel" className="selected-root" role="tabpanel" aria-labelledby={`flour-root-tab-${root.id}`} tabIndex={0} aria-live="polite"><span className="eyebrow">{root.colour}</span><h2>{root.name}</h2><p>{root.sensoryCharacter}</p><small>{root.textureCharacter}</small><b>{applications.map((item) => item?.name).join(" · ")}</b></div>
      </div>
    </section>
    <section className="product-facts-section section" aria-labelledby="flour-facts-title">
      <header className="section-head"><div><span className="eyebrow">PRODUCT INFORMATION</span><h2 id="flour-facts-title">Everything we can say—<br /><em>honestly.</em></h2></div><p>Bagian yang belum terverifikasi ditandai secara eksplisit, bukan diisi teks pengganti.</p></header>
      <div className="facts-accordion">
        <details open><summary>Product Story</summary><p>{product.story}</p></details>
        <details><summary>Best Applications</summary><p>{applications.map((item) => item?.name).join(" · ")}</p><Link className="text-link" href="/our-roots#everyday-use">Explore everyday use concepts <span>→</span></Link></details>
        <details><summary>Ingredients</summary><p className="pending-fact">{PENDING_FACT}</p></details>
        <details><summary>Preparation</summary><p className="pending-fact">Panduan preparasi resmi menyusul bersama informasi kemasan final.</p></details>
        <details><summary>Net Weight &amp; Pack Configuration</summary><ul>{product.sizes.map((size) => <li key={size.id}>{size.label}{size.available ? " · tersedia" : ""}</li>)}</ul></details>
        <details><summary>Nutrition Information</summary><p className="pending-fact">{PENDING_FACT}</p></details>
        <details><summary>Certification &amp; Legal</summary><p className="pending-fact">{PENDING_FACT}</p></details>
        <details><summary>Storage &amp; Shelf Life</summary><p className="pending-fact">{PENDING_FACT}</p></details>
      </div>
    </section>
    <section className="product-support-grid section">
      <article><span className="eyebrow">B2B INGREDIENT</span><h2>From sample to product development.</h2><p>Diskusikan bulk ingredients, sampling, dan pengembangan produk dengan tim Yubie.</p><Link className="button gold" href={`/b2b?intent=product-development&interest=flour&root=${root.id}#enquiry`} onClick={() => trackEvent("b2b_product_development_click", { product_id: product.id, root_id: root.id })}>Diskusikan pengembangan produk <span>→</span></Link></article>
      <article><span className="eyebrow">EVERYDAY USE</span><h2>Recipe concepts for this root.</h2><p>{relatedRecipes.length ? relatedRecipes.map((recipe) => recipe.title).join(" · ") : "Konsep penggunaan sedang dikembangkan."}</p><Link className="text-link" href="/our-roots#everyday-use">Explore everyday use <span>→</span></Link></article>
    </section>
  </>;
}

function ComingSoonProductDetail({ product }: { product: Product }) {
  const steps = product.usageSteps ?? [];
  const stepDescriptions: Record<string, string[]> = {
    shake: ["Buka format instan saat siap digunakan.", "Tambahkan air sesuai panduan final saat produk disetujui.", "Aduk hingga siap dinikmati."],
    ppang: ["Simpan dalam kondisi frozen sesuai spesifikasi final.", "Panaskan mengikuti petunjuk terverifikasi pada produk final.", "Nikmati dalam porsi one-bite saat dibutuhkan."],
  };
  return <>
    <section className="product-hero coming-product">
      <div className="product-detail-image"><Image src={product.image} alt={product.imageAlt} fill priority sizes="(max-width: 800px) 100vw, 55vw" unoptimized /></div>
      <div className="product-detail-copy"><span className="eyebrow">{product.eyebrow}</span><h1>{product.name.toUpperCase()}</h1><p className="descriptor">{product.descriptor}</p><p className="product-story">{product.story}</p><div className="coming-panel"><strong>Coming Soon</strong><p>Belum ada harga, launch date, atau purchase action. Daftar hanya untuk kabar produk ini.</p><a className="button primary" href="#waitlist">Join product waitlist <span>→</span></a></div><div className="product-facts"><details open><summary>Product truth status</summary><p>Final ingredients, nutrition, allergen, storage, shelf-life, certification, and preparation specification remain pending approval.</p></details></div></div>
    </section>
    {steps.length > 0 && <section className="usage-section section"><span className="eyebrow">{product.id === "shake" ? "SIMPLE PREPARATION" : "FROZEN FOR WHEN YOU WANT IT"}</span><h2>{steps.map((step) => step.toUpperCase()).join(". ")}.</h2><div>{steps.map((step, index) => <article key={step}><b>0{index + 1}</b><h3>{step}</h3><p>{(stepDescriptions[product.id] ?? [])[index] ?? "Detail menyusul bersama informasi produk final."}</p></article>)}</div></section>}
    <section className="notify-strip section" id="waitlist"><span className="eyebrow">PRODUCT-SPECIFIC WAITLIST</span><h2>{product.name} is taking root.</h2><ProductWaitlistForm productId={product.id as "shake" | "ppang" | "mie"} productName={product.name} /></section>
  </>;
}
