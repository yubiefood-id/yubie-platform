import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { siteConfig } from "@/config/site";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get("host")?.toLowerCase();
  const production = host === "yubiefood.com" || host === "www.yubiefood.com";
  return {
    rules: production
      ? { userAgent: "*", allow: "/", disallow: ["/checkout", "/cart", "/account", "/login", "/api"] }
      : { userAgent: "*", disallow: "/" },
    sitemap: `${siteConfig.origin}/sitemap.xml`,
  };
}
