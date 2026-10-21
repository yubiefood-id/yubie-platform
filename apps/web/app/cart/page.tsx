import { directCommerce } from "@/config/launch";
import { CommerceUnavailable } from "@/components/commerce/unavailable";
import type { Metadata } from "next";
import { CartView } from "@/components/cart/cart-view";

export const metadata: Metadata = {
  title: "Keranjang",
  robots: { index: false, follow: false },
};

export default function CartPage() {
  if (!directCommerce) return <CommerceUnavailable />;
  return <main id="main"><CartView /></main>;
}
