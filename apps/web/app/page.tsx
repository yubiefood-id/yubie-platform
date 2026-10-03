import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { VideoHero } from "@/components/home/video-hero";
import { ProductCard } from "@/components/commerce/product-card";
import { RootExplorer } from "@/components/discovery/root-explorer";
import { NewsletterForm } from "@/components/forms/newsletter-form";
import { products } from "@/config/products";

export const metadata: Metadata = { alternates: { canonical: "/" } };

const pillars = [
  ["01", "Five Roots, Different Characters", "Lima varietas dengan warna, rasa, tekstur, dan aplikasi berbeda."],
  ["02", "Modern Food Technology", "Pengolahan untuk produk yang lebih praktis dan konsisten."],
  ["03", "Made for Everyday Creativity", "Dari breakfast hingga bakery."],
  ["04", "Consumer to Business", "Untuk konsumen, bakery, café, UMKM, dan food business."],
];

export default function Home() {
  return <main id="main">
    {/* Poster-first video hero: the frame-accurate poster is the LCP element;
        the muted looping H.264 renditions load after, never block it. */}
    <VideoHero
      poster="/photography/hero-poster.webp"
      posterAlt="Sajian produk Yubie dengan nuansa ungu brand"
      videoSources={[
        { src: "/photography/hero-540p.mp4", media: "(max-width: 700px)" },
        { src: "/photography/hero-720p.mp4" },
      ]}
    />

    <section className="product-section section" id="products" data-home-section="products">
      <header className="section-head"><div><span className="eyebrow">THE YUBIE FAMILY</span><h2>One root family.<br /><em>Four formats.</em></h2></div><p>Tepung serbaguna untuk hari ini, konsep premium convenience dan frozen one-bite, serta format mie yang sedang diverifikasi.</p></header>
      <div className="product-grid">{products.map((product, index) => <ProductCard product={product} index={index} key={product.id} />)}</div>
    </section>

    <section className="story-section" data-home-section="our-roots-story">
      <div className="story-image"><Image src="/photography/context/root-harvest.webp" alt="Panen ubi ungu dari bedengan tanah dengan keranjang bambu di lahan Indonesia" fill sizes="(max-width: 800px) 100vw, 50vw" unoptimized /></div>
      <div className="story-copy"><span className="chapter">OUR ROOTS</span><h2>FROM INDONESIAN ROOT TO <em>MODERN USE.</em></h2><p>Yubie menjembatani ubi Indonesia dengan cara makan hari ini—dari pemilihan varietas, pengolahan, hingga produk yang praktis untuk baking, breakfast, dan kreasi sehari-hari.</p><Link className="text-link" href="/our-roots">Discover the ingredient story <span>→</span></Link><div className="story-note"><b>Our direction</b><span>Root discovery</span><span>Responsible food technology</span><span>B2C and B2B applications</span></div></div>
    </section>

    <section className="varieties-section section reveal" data-home-section="five-roots" aria-labelledby="five-roots-title">
      <header className="section-head"><div><span className="eyebrow">FIVE ROOTS, FIVE CHARACTERS</span><h2 id="five-roots-title">Meet the<br /><em>varieties.</em></h2></div><p>Lima root dengan warna, rasa, tekstur, dan arah aplikasi berbeda—bukan sekadar lima nama.</p></header>
      <RootExplorer compact />
    </section>

    <section className="why-section section reveal" data-home-section="why-yubie">
      <header className="split-head"><span className="chapter">WHY YUBIE</span><h2>LOCAL ROOTS.<br />BUILT <em>DIFFERENT.</em></h2></header>
      <div className="pillar-list">{pillars.map(([number, title, description]) => <article key={number}><span>{number}</span><div className="root-icon" aria-hidden="true">⌁</div><h3>{title}</h3><p>{description}</p></article>)}</div>
    </section>

    <section className="lifestyle-section" data-home-section="lifestyle" aria-labelledby="lifestyle-title">
      <Image src="/photography/context/lifestyle-breakfast.webp" alt="Dua perempuan Indonesia menikmati sarapan dengan Yubie Flour dan Yubie Shake" fill sizes="100vw" unoptimized />
      <div className="lifestyle-copy"><span className="eyebrow light-text">NOURISH NATURALLY</span><h2 id="lifestyle-title">Local roots.<br /><em>Everyday goodness.</em></h2></div>
    </section>

    <section className="b2b-section section reveal" data-home-section="b2b"><div><span className="eyebrow light-text">FOR BAKERIES · CAFÉS · FOOD MAKERS</span><h2>BUILD YOUR NEXT PRODUCT <em>WITH YUBIE.</em></h2></div><div><p>Mulai dari bulk ingredients dan product sampling hingga pembahasan product development sesuai kebutuhan bisnis Anda.</p><Link className="button gold" href="/b2b#enquiry">Request a B2B Sample <span>↗</span></Link></div></section>

    <section className="newsletter-section section" data-home-section="community"><div><span className="eyebrow">YUBIE COMMUNITY</span><h2>DON’T MISS<br /><em>WHAT’S COOKING.</em></h2><p>Recipes, product drops, local food stories, and Yubie updates—sent occasionally. Newsletter consent terpisah dari product waitlist.</p></div><NewsletterForm /></section>
  </main>;
}
