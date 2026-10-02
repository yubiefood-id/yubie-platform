import type { Metadata } from "next";
import { CheckoutCancel } from "@/components/checkout/checkout-cancel";

export const metadata: Metadata = {
  title: "Pembayaran Dibatalkan",
  robots: { index: false, follow: false },
};

export default function CheckoutCancelPage() {
  return <main id="main"><CheckoutCancel /></main>;
}
