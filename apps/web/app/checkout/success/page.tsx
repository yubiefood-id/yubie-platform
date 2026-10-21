import { directCommerce } from "@/config/launch";
import { CommerceUnavailable } from "@/components/commerce/unavailable";
import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckoutSuccess } from "@/components/checkout/checkout-success";

export const metadata: Metadata = {
  title: "Status Pembayaran",
  robots: { index: false, follow: false },
};

export default function CheckoutSuccessPage() {
  if (!directCommerce) return <CommerceUnavailable />;
  return <main id="main"><Suspense fallback={<div className="checkout-page" aria-busy="true"><p className="cart-loading">Memuat status…</p></div>}><CheckoutSuccess /></Suspense></main>;
}
