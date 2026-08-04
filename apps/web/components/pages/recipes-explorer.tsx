"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

const recipes = [
  { slug: "purple-pancakes", title: "Purple Sweet Potato Pancakes", category: "Breakfast", time: "20 min", image: "/photography/ingredient-table.webp" },
  { slug: "yubie-brownies", title: "Yubie Brownies", category: "Baking", time: "45 min", image: "/photography/brand-foundation.webp" },
  { slug: "soft-cookies", title: "Soft Sweet Potato Cookies", category: "Snacks", time: "35 min", image: "/photography/photography-direction.webp" },
  { slug: "yubie-ppang", title: "Yubie Ppang", category: "UMKM Ideas", time: "Prototype", image: "/photography/ppang-box.webp" },
  { slug: "creamy-bowl", title: "Creamy Breakfast Bowl", category: "Family", time: "15 min", image: "/photography/shake-preparation.webp" },
];
const filters = ["All", "Breakfast", "Baking", "Snacks", "Family", "UMKM Ideas"];
export function RecipesExplorer() { const [active, setActive] = useState("All"); const shown = active === "All" ? recipes : recipes.filter((recipe) => recipe.category === active); return <><div className="recipe-filters" aria-label="Filter recipe">{filters.map((filter) => <button className={active === filter ? "active" : ""} key={filter} onClick={() => setActive(filter)}>{filter}</button>)}</div><div className="recipe-grid">{shown.map((recipe, index) => <article key={recipe.slug} className={index % 3 === 0 ? "wide" : ""}><Link className="recipe-image" href={`/recipes/${recipe.slug}`}><Image src={recipe.image} alt="" fill sizes="(max-width: 700px) 100vw, 50vw" unoptimized /></Link><span>{recipe.category} · {recipe.time}</span><h2><Link href={`/recipes/${recipe.slug}`}>{recipe.title}</Link></h2><Link className="text-link" href={`/recipes/${recipe.slug}`}>View recipe <b>→</b></Link></article>)}</div></>; }
