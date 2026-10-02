import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Produk",
  robots: { index: false, follow: true },
};

export default function ShopPage() {
  permanentRedirect("/products");
}
