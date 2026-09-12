import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { foodApplications, productFamilies, recipes, rootVarieties } from "@yubie/domain";

export function generateStaticParams() { return recipes.map((recipe) => ({ slug: recipe.slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> { const { slug } = await params; const recipe = recipes.find((item) => item.slug === slug); if (!recipe) return {}; return { title: recipe.title, description: `${recipe.title}, a Yubie recipe concept.`, alternates: { canonical: `/recipes/${recipe.slug}` } }; }

export default async function RecipePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const recipe = recipes.find((item) => item.slug === slug);
  if (!recipe) notFound();
  const product = productFamilies.find((item) => recipe.productIds.includes(item.id));
  const roots = rootVarieties.filter((item) => recipe.rootIds.includes(item.id));
  const application = foodApplications.find((item) => item.id === recipe.applicationId);
  return <main id="main" className="recipe-detail revised-recipe">
    <div className="recipe-detail-copy"><span className="eyebrow">RECIPE CONCEPT · {recipe.category}</span><h1>{recipe.title}</h1><div className="made-with"><span>MADE WITH</span><strong>{product?.name} · {roots.map((root) => root.name).join(" / ")}</strong><small>{application?.name}</small></div><p className="recipe-note">Takaran, ingredients, allergen information, duration, dan metode akan diterbitkan hanya setelah verifikasi dapur final. Karena itu halaman ini tidak menerbitkan Recipe structured data.</p>{product?.status === "available" ? <Link className="button primary" href={`/products/${product.slug}`}>Shop {product.name} <span>→</span></Link> : <Link className="button primary" href={`/products/${product?.slug}#waitlist`}>Join {product?.name} waitlist <span>→</span></Link>}</div>
    <div className="recipe-detail-image"><Image src={recipe.image} alt={recipe.imageAlt} fill priority sizes="(max-width: 800px) 100vw, 50vw" unoptimized /><span>Concept visual · final recipe photography pending</span></div>
  </main>;
}
