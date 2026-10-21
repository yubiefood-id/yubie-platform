import { directCommerce } from "@/config/launch";
import { CommerceUnavailable } from "@/components/commerce/unavailable";
import type { Metadata } from "next";
import { CheckoutView } from "@/components/checkout/checkout-view";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  if (!directCommerce) return <CommerceUnavailable />;
  return <main id="main"><CheckoutView /></main>;
}
