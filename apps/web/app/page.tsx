import Image from "next/image";
import Link from "next/link";
import { ProductCard } from "@/components/commerce/product-card";
import { NewsletterForm } from "@/components/forms/newsletter-form";
import { products } from "@/config/products";

const pillars = [
  ["01", "Multi-varietal approach", "Beragam varietas ubi Indonesia membawa warna, rasa, dan karakter kuliner yang berbeda."],
  ["02", "Made for everyday creativity", "Dari sarapan cepat hingga bakery—satu bahan, banyak cara untuk bereksperimen."],
  ["03", "Local food, modern format", "Bahan pangan lokal diterjemahkan menjadi format praktis untuk dapur masa kini."],
  ["04", "More value from every harvest", "Kami membangun jalan baru bagi bahan lokal untuk tumbuh bersama konsumen modern."],
];

const varieties = ["Ubi Ungu", "Ubi Madu", "Ubi Oranye", "Ubi Merah", "Ubi Jepang"];
const uses = ["Pancakes", "Cookies", "Brownies", "Cake", "Noodles", "Porridge"];

export default function Home() {
  return <main id="main">
    <section className="hero" aria-labelledby="hero-title">
      <Image className="hero-image" src="/photography/hero-lifestyle.webp" alt="Perempuan Indonesia berhijab menikmati minuman ubi ungu bersama rangkaian produk Yubie" fill priority sizes="100vw" unoptimized />
      <div className="hero-scrim" />
      <div className="hero-copy"><span className="eyebrow light-text">INDONESIAN ROOTS. MODERN NOURISHMENT.</span><h1 id="hero-title">ROOTED HERE.<br /><em>MADE FOR NOW.</em></h1><p>Temui cara baru menikmati ubi Indonesia—ditransformasi menjadi produk praktis untuk baking, breakfast, dan kreasi sehari-hari.</p><div className="hero-actions"><Link className="button gold" href="/shop">Shop Yubie <span>↗</span></Link><Link className="text-link light-text" href="/our-roots">Discover Our Roots <span>→</span></Link></div></div>
      <div className="hero-index"><span>01</span><i /><small>SCROLL TO DISCOVER</small></div>
    </section>

    <div className="marquee" aria-label="Sweet potato, reimagined"><div>SWEET POTATO, REIMAGINED <b>✦</b> LOCAL ROOTS <b>✦</b> MODERN FOOD <b>✦</b> MADE FOR EVERYDAY CREATIONS <b>✦</b> SWEET POTATO, REIMAGINED <b>✦</b> LOCAL ROOTS <b>✦</b></div></div>

    <section className="product-section section" id="products">
      <header className="section-head"><div><span className="eyebrow">THE YUBIE FAMILY</span><h2>Good food,<br /><em>made curious.</em></h2></div><p>Tiga ekspresi dari satu akar—untuk memasak, minum, dan menikmati sesuatu yang berbeda.</p></header>
      <div className="product-grid">{products.map((product, index) => <ProductCard product={product} index={index} key={product.id} />)}</div>
    </section>

    <section className="why-section section">
      <header className="split-head"><span className="chapter">02 / WHY YUBIE</span><h2>LOCAL ROOTS.<br />BUILT <em>DIFFERENT.</em></h2></header>
      <div className="pillar-list">{pillars.map(([number, title, description]) => <article key={number}><span>{number}</span><div className="root-icon" aria-hidden="true">⌁</div><h3>{title}</h3><p>{description}</p></article>)}</div>
    </section>

    <section className="spotlight-section">
      <div className="spotlight-copy"><span className="eyebrow light-text">YUBIE FLOUR · THE FOUNDATION</span><h2>ONE ROOT.<br /><em>ENDLESS</em><br />POSSIBILITIES.</h2><p>Tepung ubi jalar serbaguna yang mengundang eksperimen—dari resep rumahan hingga ide produk baru.</p><Link className="button warm" href="/products/yubie-flour">Explore Yubie Flour <span>→</span></Link></div>
      <div className="spotlight-visual"><Image src="/photography/ingredient-table.webp" alt="Ubi jalar, tepung, minuman dan bahan-bahan Yubie di atas meja" fill sizes="(max-width: 800px) 100vw, 55vw" unoptimized /><div className="uses-wheel">{uses.map((use, index) => <span key={use} style={{ "--i": index } as React.CSSProperties}>{use}</span>)}</div></div>
    </section>

    <section className="varieties-section section">
      <header className="section-head"><div><span className="eyebrow">FIVE ROOTS, FIVE CHARACTERS</span><h2>Meet the<br /><em>varieties.</em></h2></div><p>Warna alami, rasa, dan tekstur yang khas membuka bahasa kuliner yang lebih luas.</p></header>
      <div className="variety-stage"><Image src="/photography/ingredient-table.webp" alt="Beragam bentuk ubi dan tepung ubi" fill sizes="100vw" unoptimized /><div className="variety-list">{varieties.map((variety, index) => <div key={variety}><span>0{index + 1}</span><strong>{variety}</strong><i>Natural character · Culinary exploration</i></div>)}</div></div>
    </section>

    <section className="story-section">
      <div className="story-image"><Image src="/photography/shake-preparation.webp" alt="Proses menyiapkan minuman Yubie Shake" fill sizes="(max-width: 800px) 100vw, 50vw" unoptimized /></div>
      <div className="story-copy"><span className="chapter">03 / OUR ROOTS</span><h2>FROM INDONESIAN SOIL TO <em>MODERN TABLES.</em></h2><p>Yubie berawal dari keyakinan sederhana: pangan lokal layak punya masa depan yang lebih besar. Kami menerjemahkan ubi Indonesia menjadi format yang dekat dengan ritme hidup hari ini.</p><Link className="text-link" href="/our-roots">Read our story <span>→</span></Link><div className="story-note"><b>Our direction</b><span>Local ingredient innovation</span><span>Food-UMKM collaboration</span><span>Responsible product development</span></div></div>
    </section>

    <section className="b2b-section section"><div><span className="eyebrow light-text">FOR BAKERIES · CAFÉS · FOOD MAKERS</span><h2>BUILD YOUR NEXT PRODUCT <em>WITH YUBIE.</em></h2></div><div><p>Eksplorasi bahan lokal yang distinctive melalui sampling, aplikasi produk, dan diskusi kolaborasi yang relevan untuk bisnis Anda.</p><Link className="button gold" href="/b2b">Request a B2B Sample <span>↗</span></Link></div></section>

    <section className="newsletter-section section"><div><span className="eyebrow">YUBIE COMMUNITY</span><h2>DON’T MISS<br /><em>WHAT’S COOKING.</em></h2><p>Recipes, product drops, local food stories, and Yubie updates—sent occasionally.</p></div><NewsletterForm /></section>
  </main>;
}
