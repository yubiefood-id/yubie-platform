"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { filterRecipes, productFamilies, rootVarieties } from "@yubie/domain";
import { trackEvent } from "@/lib/analytics";

export function RecipesExplorer({ initialProductId = "", initialRootId = "" }: { initialProductId?: string; initialRootId?: string }) {
  const [productId, setProductId] = useState(initialProductId);
  const [rootId, setRootId] = useState(initialRootId);

  const shown = useMemo(() => filterRecipes(productId || undefined, rootId || undefined), [productId, rootId]);
  const setFilter = (kind: "product" | "root", value: string) => {
    const nextProduct = kind === "product" ? value : productId;
    const nextRoot = kind === "root" ? value : rootId;
    setProductId(nextProduct);
    setRootId(nextRoot);
    const params = new URLSearchParams();
    if (nextProduct) params.set("product", nextProduct);
    if (nextRoot) params.set("root", nextRoot);
    window.history.replaceState({}, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
    trackEvent("recipe_filter_change", { filter: kind, value: value || "all" });
  };
  const resetFilters = () => {
    setProductId("");
    setRootId("");
    window.history.replaceState({}, "", window.location.pathname);
    trackEvent("recipe_filter_change", { filter: "all", value: "all" });
  };

  return <>
    <div className="recipe-filter-groups">
      <fieldset><legend>By Product</legend><div>{[{ id: "", name: "All" }, ...productFamilies].map((item) => <button type="button" aria-pressed={productId === item.id} className={productId === item.id ? "active" : ""} key={item.id || "all-products"} onClick={() => setFilter("product", item.id)}>{item.name}</button>)}</div></fieldset>
      <fieldset><legend>By Root</legend><div>{[{ id: "", name: "All" }, ...rootVarieties].map((item) => <button type="button" aria-pressed={rootId === item.id} className={rootId === item.id ? "active" : ""} key={item.id || "all-roots"} onClick={() => setFilter("root", item.id)}>{item.name}</button>)}</div></fieldset>
    </div>
    <p className="recipe-result-status" role="status">{shown.length} recipe concept{shown.length === 1 ? "" : "s"}</p>
    <div className="recipe-grid">{shown.map((recipe, index) => {
      const product = productFamilies.find((item) => recipe.productIds.includes(item.id));
      const roots = rootVarieties.filter((item) => recipe.rootIds.includes(item.id));
      return <article key={recipe.slug} className={index % 3 === 0 ? "wide" : ""}><Link className="recipe-image" href={`/recipes/${recipe.slug}`} onClick={() => trackEvent("recipe_product_click", { recipe_id: recipe.id, product_id: product?.id ?? "unknown" })}><Image src={recipe.image} alt={recipe.imageAlt} fill sizes="(max-width: 700px) 100vw, 50vw" unoptimized /></Link><span>{product?.name} · {roots.map((root) => root.name).join(" / ")}</span><h2><Link href={`/recipes/${recipe.slug}`}>{recipe.title}</Link></h2><p>{recipe.category} · Recipe concept</p><Link className="text-link" href={`/recipes/${recipe.slug}`}>View recipe <b>→</b></Link></article>;
    })}</div>
    {shown.length === 0 && <div className="recipe-empty"><h2>No concept matches both filters yet.</h2><button className="button primary" onClick={resetFilters}>Reset filters</button></div>}
  </>;
}
