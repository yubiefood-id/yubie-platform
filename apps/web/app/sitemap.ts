import type { MetadataRoute } from "next";
import { products } from "@/config/products";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://yubie.id";
  const routes = ["", "/shop", "/recipes", "/our-roots", "/impact", "/b2b", "/faq", "/privacy", "/terms"];
  return [...routes.map((route) => ({ url: `${base}${route}`, changeFrequency: route === "" ? "weekly" as const : "monthly" as const, priority: route === "" ? 1 : .7 })), ...products.map((product) => ({ url: `${base}/products/${product.slug}`, changeFrequency: "monthly" as const, priority: .8 }))];
}
