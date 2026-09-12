import Image from "next/image";
import Link from "next/link";
import { productFamilies, recipes, rootVarieties } from "@yubie/domain";

export function RecipeShelf() {
  return <section className="recipe-shelf section" aria-labelledby="recipe-shelf-title">
    <header className="section-head"><div><span className="eyebrow">THE YUBIE KITCHEN</span><h2 id="recipe-shelf-title">Root to<br /><em>recipe.</em></h2></div><p>Temukan hubungan antara product format, varietas root, dan aplikasi. Semua resep masih berstatus konsep sampai uji dapur selesai.</p></header>
    <div className="recipe-shelf-grid">{recipes.slice(0, 3).map((recipe) => {
      const product = productFamilies.find((item) => recipe.productIds.includes(item.id));
      const root = rootVarieties.find((item) => recipe.rootIds.includes(item.id));
      return <article key={recipe.id}><Link className="recipe-shelf-image" href={`/recipes/${recipe.slug}`}><Image src={recipe.image} alt={recipe.imageAlt} fill sizes="(max-width: 760px) 100vw, 33vw" unoptimized /></Link><span className="eyebrow">{product?.name} · {root?.name}</span><h3><Link href={`/recipes/${recipe.slug}`}>{recipe.title}</Link></h3><p>{recipe.category} · Recipe concept</p><Link className="text-link" href={`/recipes/${recipe.slug}`}>View recipe <span>→</span></Link></article>;
    })}</div>
    <Link className="button primary recipe-all" href="/recipes">Explore All Recipes <span>→</span></Link>
  </section>;
}
