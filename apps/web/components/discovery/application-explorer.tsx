"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { foodApplications, productFamilies, recipes, rootVarieties } from "@yubie/domain";
import { trackEvent } from "@/lib/analytics";

export function ApplicationExplorer() {
  const [activeId, setActiveId] = useState(foodApplications[0].id);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const active = foodApplications.find((item) => item.id === activeId) ?? foodApplications[0];
  const recipe = recipes.find((item) => active.recipeIds.includes(item.id));
  const product = productFamilies.find((item) => active.productIds.includes(item.id));
  const roots = rootVarieties.filter((item) => active.rootIds.includes(item.id));

  const select = (id: string, source: "pointer" | "keyboard") => {
    setActiveId(id);
    trackEvent("application_select", { application_id: id, source });
  };

  const onKeyDown = (index: number, event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!(["ArrowUp", "ArrowDown", "Home", "End"] as string[]).includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? foodApplications.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + foodApplications.length) % foodApplications.length;
    select(foodApplications[next].id, "keyboard");
    tabs.current[next]?.focus();
  };

  return <section className="application-explorer" aria-labelledby="applications-title">
    <div className="application-copy">
      <span className="eyebrow light-text">YUBIE FLOUR · APPLICATION DISCOVERY</span>
      <h2 id="applications-title">ONE ROOT.<br /><em>ENDLESS</em><br />POSSIBILITIES.</h2>
      <p>Tepung ubi serbaguna untuk mengeksplorasi sarapan, baking, savoury, dan ide pengembangan produk.</p>
      <div className="application-tabs" role="tablist" aria-label="Pilih aplikasi Yubie Flour">
        {foodApplications.map((item, index) => <button
          ref={(element) => { tabs.current[index] = element; }}
          id={`application-tab-${item.id}`}
          key={item.id}
          role="tab"
          aria-selected={active.id === item.id}
          aria-controls="application-panel"
          tabIndex={active.id === item.id ? 0 : -1}
          onMouseEnter={() => select(item.id, "pointer")}
          onFocus={() => setActiveId(item.id)}
          onClick={() => select(item.id, "pointer")}
          onKeyDown={(event) => onKeyDown(index, event)}
        >{item.name}</button>)}
      </div>
    </div>
    <div id="application-panel" className="application-panel" role="tabpanel" aria-labelledby={`application-tab-${active.id}`} tabIndex={0}>
      <Image src={active.image} alt={active.imageAlt} fill sizes="(max-width: 900px) 100vw, 55vw" unoptimized />
      <div className="application-card"><span className="eyebrow">{product?.name} · {roots.map((root) => root.name).join(" / ")}</span><h3>{active.name}</h3><p>{active.descriptor}</p>{recipe ? <Link className="text-link" href={`/recipes/${recipe.slug}`} onClick={() => trackEvent("application_recipe_click", { application_id: active.id, recipe_id: recipe.id })}>View recipe concept <span>→</span></Link> : <span className="concept-label">Recipe development in progress</span>}<small>Visual referensi sementara; foto hasil aplikasi spesifik masih diperlukan.</small></div>
    </div>
  </section>;
}
