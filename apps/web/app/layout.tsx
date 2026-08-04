import type { Metadata } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";
import { CartDrawer } from "@/components/commerce/cart-drawer";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { CartProvider } from "@/features/cart/cart-context";
import "./globals.css";

const manrope = Manrope({ variable: "--font-sans", subsets: ["latin"] });
const cormorant = Cormorant_Garamond({ variable: "--font-serif", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://yubie.id"),
  title: { default: "Yubie — Rooted here. Made for now.", template: "%s · Yubie" },
  description: "Yubie mengubah ubi Indonesia menjadi produk pangan modern untuk baking, breakfast, dan everyday creations.",
  openGraph: { title: "Yubie — Rooted here. Made for now.", description: "Modern Indonesian sweet-potato food, made for now.", images: ["/photography/hero-lifestyle.webp"] },
  other: { "codex-preview": "development" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const jsonLd = { "@context": "https://schema.org", "@type": "Organization", name: "Yubie", slogan: "Rooted here. Made for now.", address: { "@type": "PostalAddress", addressLocality: "Bogor", addressCountry: "ID" } };
  return <html lang="id"><body className={`${manrope.variable} ${cormorant.variable}`}><CartProvider><Header />{children}<Footer /><CartDrawer /><div className="sr-only" aria-live="polite" id="cart-announcer" /></CartProvider><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} /></body></html>;
}
