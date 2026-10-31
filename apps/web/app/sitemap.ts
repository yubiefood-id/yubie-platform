import type { MetadataRoute } from "next";
import { products } from "@/config/products";
import { siteConfig } from "@/config/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteConfig.origin;
  const routes = ["", "/products", "/our-story", "/our-roots", "/impact", "/b2b", "/faq", "/terms", "/privacy", "/refund-policy", "/contact"];
  return [
    ...routes.map((route) => ({ url: `${base}${route}`, changeFrequency: route === "" ? "weekly" as const : "monthly" as const, priority: route === "" ? 1 : .7 })),
    ...products.map((product) => ({ url: `${base}/products/${product.slug}`, changeFrequency: "monthly" as const, priority: .8 })),
  ];
}
