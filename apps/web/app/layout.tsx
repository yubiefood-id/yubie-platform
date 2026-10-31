import type { Metadata } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { CartProvider } from "@/features/cart/cart-context";
import { StorefrontWidgets } from "@/components/commerce/storefront-widgets";
import { siteConfig } from "@/config/site";
import { directCommerce } from "@/config/launch";
import { merchantIdentity, merchantIdentityComplete } from "@/config/merchant-identity";
import "./globals.css";

const manrope = Manrope({ variable: "--font-sans", subsets: ["latin"] });
const cormorant = Cormorant_Garamond({ variable: "--font-serif", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.origin),
  title: { default: "Yubie — Rooted here. Made for now.", template: "%s · Yubie" },
  description: "Yubie mengubah ubi Indonesia menjadi produk pangan modern untuk baking, breakfast, dan everyday creations.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/favicon.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: { title: "Yubie — Rooted here. Made for now.", description: "Modern Indonesian sweet-potato food, made for now.", images: ["/photography/context/lifestyle-breakfast.webp"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Organization structured data uses only owner-verified merchant identity
  // fields; unverifiable facts (street address, phone, legal name) stay out
  // until the merchant identity is complete.
  const verified = merchantIdentityComplete ? merchantIdentity : null;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Yubie",
    url: siteConfig.origin,
    email: siteConfig.email,
    slogan: "Rooted here. Made for now.",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Bogor",
      addressRegion: "Jawa Barat",
      addressCountry: "ID",
      ...(verified?.registeredAddress ? { streetAddress: verified.registeredAddress.value } : {}),
    },
    sameAs: [siteConfig.social.instagram, siteConfig.social.tiktok],
    ...(verified?.legalOperatorName ? { legalName: verified.legalOperatorName.value } : {}),
    ...(verified?.supportPhone ? { telephone: verified.supportPhone.value } : {}),
  };
  const content = <><Header />{children}<Footer />{directCommerce && <StorefrontWidgets />}</>;
  return <html lang="id"><body className={`${manrope.variable} ${cormorant.variable}`}>{directCommerce ? <CartProvider>{content}</CartProvider> : content}<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} /></body></html>;
}
