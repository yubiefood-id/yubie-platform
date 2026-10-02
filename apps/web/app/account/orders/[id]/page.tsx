import type { Metadata } from "next";
import { OrderDetailView } from "@/components/auth/order-detail-view";

export const metadata: Metadata = {
  title: "Detail Pesanan",
  robots: { index: false, follow: false },
};

// Static-export hosts (Vercel preview) prerender a sentinel shell; the real
// detail pages are client-rendered per order id on the worker runtime.
export function generateStaticParams() {
  return [{ id: "preview" }];
}

export default function AccountOrderDetailPage() {
  return <main id="main"><OrderDetailView /></main>;
}
