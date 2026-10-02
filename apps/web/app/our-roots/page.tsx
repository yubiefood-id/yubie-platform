import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { productFamilies, recipes, rootVarieties } from "@yubie/domain";
import { RootExplorer } from "@/components/discovery/root-explorer";

export const metadata: Metadata = { title: "Our Roots", description: "Discover the five roots behind Yubie's product and application system.", alternates: { canonical: "/our-roots" } };

const process = [
  ["01", "Raw Root", "Varietas dipahami melalui warna, rasa, tekstur, dan potensi aplikasinya."],
  ["02", "Preparation", "Bahan disiapkan dengan standar yang harus mengikuti spesifikasi produk final."],
  ["03", "Processing", "Food technology menerjemahkan root menjadi format yang lebih praktis dan konsisten."],
  ["04", "Flour", "Format ingredient membuka eksplorasi B2C dan pengembangan produk B2B."],
  ["05", "Modern Use", "Root berlanjut menjadi baking, breakfast, savoury, Shake, dan Ppang."],
];

export default function RootsPage() {
  return <main id="main" className="roots-page">
    <header className="roots-hero"><div><span className="eyebrow">OUR ROOTS</span><h1>Local food deserves<br /><em>a bigger future.</em></h1><p>Yubie menghubungkan karakter ubi Indonesia dengan cara makan, memasak, dan membangun produk yang relevan untuk hari ini.</p></div><div><Image src="/photography/hero-lifestyle.webp" alt="Rangkaian Yubie dalam konteks gaya hidup modern" fill priority sizes="(max-width: 800px) 100vw, 50vw" unoptimized /></div></header>
    <section className="root-process section" aria-labelledby="root-process-title"><span className="eyebrow">FROM ROOT TO MODERN USE</span><h2 id="root-process-title">An ingredient story,<br />not an empty promise.</h2><div>{process.map(([number, title, description]) => <article key={number}><b>{number}</b><h3>{title}</h3><p>{description}</p></article>)}</div><p className="process-note">Visual tahap produksi dan sourcing masih membutuhkan aset Yubie yang disetujui; ilustrasi proses tidak digunakan sebagai pengganti bukti operasional.</p></section>
    <section className="roots-discovery section" id="five-roots" aria-labelledby="roots-discovery-title"><header className="section-head"><div><span className="eyebrow">FIVE ROOTS</span><h2 id="roots-discovery-title">Different roots.<br /><em>Different directions.</em></h2></div><p>Data varietas ini berasal dari sumber canonical yang sama dengan homepage, Flour selector, dan filter penggunaan. Klaim nutrisi yang belum disetujui tidak ditampilkan.</p></header><RootExplorer /></section>
    {/* Everyday use: the former /recipes concept shelf, now part of Our Roots.
        All recipe data remains publicationStatus "concept" — amounts and
        allergens stay withheld and no Recipe structured data is published. */}
    <section className="everyday-use section" id="everyday-use" aria-labelledby="everyday-use-title">
      <header className="section-head"><div><span className="eyebrow">EVERYDAY USE</span><h2 id="everyday-use-title">From root to<br /><em>everyday table.</em></h2></div><p>Concepts dari dapur Yubie untuk melihat ke mana satu bahan lokal dapat membawa kreativitas Anda. Semua masih berstatus konsep sampai uji dapur selesai.</p></header>
      <div className="recipe-grid">
        {recipes.map((recipe) => {
          const product = productFamilies.find((item) => recipe.productIds.includes(item.id));
          const root = rootVarieties.find((item) => recipe.rootIds.includes(item.id));
          return <article key={recipe.id} className={recipe.id === "purple-pancakes" ? "wide" : ""}>
            <Link className="recipe-image" href={product ? `/products/${product.slug}` : "/products"}><Image src={recipe.image} alt={recipe.imageAlt} fill sizes="(max-width: 700px) 100vw, 50vw" unoptimized /></Link>
            <span className="eyebrow">{product?.name} · {root?.name}</span>
            <h2>{recipe.title}</h2>
            <p>{recipe.category} · Recipe concept</p>
            {product && <Link className="text-link" href={`/products/${product.slug}`}>{product.status === "available" ? `Shop ${product.name}` : `Explore ${product.name}`} <span>→</span></Link>}
          </article>;
        })}
      </div>
    </section>
  </main>;
}
