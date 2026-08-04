"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { navigation, siteConfig } from "@/config/site";
import { products } from "@/config/products";
import { useCart } from "@/features/cart/cart-context";

export function Header() {
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const [query, setQuery] = useState("");
  const { count, setOpen } = useCart();
  const results = query.trim() ? products.filter((p) => `${p.name} ${p.descriptor}`.toLowerCase().includes(query.toLowerCase())) : products;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMenu(false); setSearch(false); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearch(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => { document.body.style.overflow = menu || search ? "hidden" : ""; return () => { document.body.style.overflow = ""; }; }, [menu, search]);

  return <>
    <a className="skip-link" href="#main">Lewati ke konten utama</a>
    <div className="announcement">{siteConfig.announcement}</div>
    <header className="site-header">
      <Link className="brand" href="/" aria-label="Yubie home"><Image src="/brand/yubie-logo.webp" alt="Yubie — Nourish Naturally" width={155} height={84} priority unoptimized /></Link>
      <nav className="desktop-nav" aria-label="Navigasi utama">{navigation.map((item) => <Link href={item.href} key={item.href}>{item.label}</Link>)}</nav>
      <div className="nav-actions">
        <button className="text-button search-trigger" onClick={() => setSearch(true)}>Search <kbd>⌘K</kbd></button>
        <button className="text-button" onClick={() => setOpen(true)}>Cart <span className="cart-count" aria-label={`${count} item`}>{count}</span></button>
        <button className="menu-button" onClick={() => setMenu(true)} aria-label="Buka menu"><span /><span /></button>
      </div>
    </header>
    {menu && <div className="menu-overlay" role="dialog" aria-modal="true" aria-label="Menu utama"><button className="icon-button light" onClick={() => setMenu(false)} aria-label="Tutup menu">×</button><p className="eyebrow">ROOTED HERE. MADE FOR NOW.</p>{navigation.map((item, index) => <Link href={item.href} key={item.href} onClick={() => setMenu(false)}><span>0{index + 1}</span>{item.label}</Link>)}</div>}
    {search && <div className="search-overlay" role="dialog" aria-modal="true" aria-labelledby="search-title"><button className="icon-button" onClick={() => setSearch(false)} aria-label="Tutup pencarian">×</button><div className="search-inner"><span className="eyebrow">DISCOVER YUBIE</span><h2 id="search-title">Cari sesuatu yang baik.</h2><label><span className="sr-only">Cari produk</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Flour, shake, ppang…" /></label><div className="search-results">{results.length ? results.map((product) => <Link href={`/products/${product.slug}`} key={product.id} onClick={() => setSearch(false)}><span>{product.eyebrow}</span><strong>{product.name}</strong><i>→</i></Link>) : <p>Tidak ada hasil. Coba “flour” atau “shake”.</p>}</div></div></div>}
  </>;
}
