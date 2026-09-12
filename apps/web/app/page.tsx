import Image from "next/image";
import Link from "next/link";
import { ProductCard } from "@/components/commerce/product-card";
import { ApplicationExplorer } from "@/components/discovery/application-explorer";
import { RecipeShelf } from "@/components/discovery/recipe-shelf";
import { RootExplorer } from "@/components/discovery/root-explorer";
import { NewsletterForm } from "@/components/forms/newsletter-form";
import { products } from "@/config/products";

const pillars = [
  ["01", "Five Roots, Different Characters", "Lima varietas dengan warna, rasa, tekstur, dan aplikasi berbeda."],
  ["02", "Modern Food Technology", "Pengolahan untuk produk yang lebih praktis dan konsisten."],
  ["03", "Made for Everyday Creativity", "Dari breakfast hingga bakery."],
  ["04", "Consumer to Business", "Untuk konsumen, bakery, café, UMKM, dan food business."],
];

export default function Home() {
  return <main id="main">
    <section className="hero" aria-labelledby="hero-title">
      <Image className="hero-image" src="/photography/hero-lifestyle.webp" alt="Perempuan Indonesia berhijab menikmati minuman ubi ungu bersama rangkaian produk Yubie" fill priority sizes="100vw" unoptimized />
      <div className="hero-scrim" />
      <div className="hero-copy"><span className="eyebrow light-text">INDONESIAN ROOTS. MODERN NOURISHMENT.</span><h1 id="hero-title">ROOTED HERE.<br /><em>MADE FOR NOW.</em></h1><p>Temui cara baru menikmati ubi Indonesia—ditransformasi menjadi produk praktis untuk baking, breakfast, dan kreasi sehari-hari.</p><div className="hero-actions"><Link className="button gold" href="/shop">Shop Yubie <span>↗</span></Link><Link className="text-link light-text" href="/our-roots">Discover Our Roots <span>→</span></Link></div></div>
      <div className="hero-index"><span>01</span><i /><small>SCROLL TO DISCOVER</small></div>
    </section>

    <div className="marquee" aria-label="Sweet potato, reimagined"><div>SWEET POTATO, REIMAGINED <b>✦</b> LOCAL ROOTS <b>✦</b> MODERN FOOD <b>✦</b> MADE FOR EVERYDAY CREATIONS <b>✦</b> SWEET POTATO, REIMAGINED <b>✦</b> LOCAL ROOTS <b>✦</b></div></div>

    <section className="product-section section" id="products" data-home-section="products">
      <header className="section-head"><div><span className="eyebrow">THE YUBIE FAMILY</span><h2>One root family.<br /><em>Three formats.</em></h2></div><p>Yubie menerjemahkan ubi menjadi everyday ingredient, premium convenience, dan frozen one-bite.</p></header>
      <div className="product-grid">{products.map((product, index) => <ProductCard product={product} index={index} key={product.id} />)}</div>
    </section>

    <section className="varieties-section section" data-home-section="five-roots" aria-labelledby="five-roots-title">
      <header className="section-head"><div><span className="eyebrow">FIVE ROOTS, FIVE CHARACTERS</span><h2 id="five-roots-title">Meet the<br /><em>varieties.</em></h2></div><p>Lima root dengan warna, rasa, tekstur, dan arah aplikasi berbeda—bukan sekadar lima nama.</p></header>
      <RootExplorer compact />
    </section>

    <section className="why-section section" data-home-section="why-yubie">
      <header className="split-head"><span className="chapter">02 / WHY YUBIE</span><h2>LOCAL ROOTS.<br />BUILT <em>DIFFERENT.</em></h2></header>
      <div className="pillar-list">{pillars.map(([number, title, description]) => <article key={number}><span>{number}</span><div className="root-icon" aria-hidden="true">⌁</div><h3>{title}</h3><p>{description}</p></article>)}</div>
    </section>

    <div data-home-section="flour-applications"><ApplicationExplorer /></div>
    <div data-home-section="recipes"><RecipeShelf /></div>

    <section className="story-section" data-home-section="our-roots">
      <div className="story-image"><Image src="/photography/shake-preparation.webp" alt="Proses menyiapkan bahan Yubie untuk penggunaan modern" fill sizes="(max-width: 800px) 100vw, 50vw" unoptimized /></div>
      <div className="story-copy"><span className="chapter">03 / OUR ROOTS</span><h2>FROM INDONESIAN ROOT TO <em>MODERN USE.</em></h2><p>Root → pengolahan → flour dan product format → aplikasi kontemporer. Yubie membangun jembatan dari bahan yang dekat dengan Indonesia menuju cara makan hari ini.</p><Link className="text-link" href="/our-roots">Discover the ingredient story <span>→</span></Link><div className="story-note"><b>Our direction</b><span>Root discovery</span><span>Responsible food technology</span><span>B2C and B2B applications</span></div></div>
    </section>

    <section className="b2b-section section" data-home-section="b2b"><div><span className="eyebrow light-text">FOR BAKERIES · CAFÉS · FOOD MAKERS</span><h2>BUILD YOUR NEXT PRODUCT <em>WITH YUBIE.</em></h2></div><div><p>Mulai dari bulk ingredients dan product sampling hingga pembahasan product development sesuai kebutuhan bisnis Anda.</p><Link className="button gold" href="/b2b#enquiry">Request a B2B Sample <span>↗</span></Link></div></section>

    <section className="newsletter-section section" data-home-section="community"><div><span className="eyebrow">YUBIE COMMUNITY</span><h2>DON’T MISS<br /><em>WHAT’S COOKING.</em></h2><p>Recipes, product drops, local food stories, and Yubie updates—sent occasionally. Newsletter consent terpisah dari product waitlist.</p></div><NewsletterForm /></section>
  </main>;
}
