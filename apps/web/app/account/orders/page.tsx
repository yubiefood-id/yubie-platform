import type { Metadata } from "next";
import { OrdersView } from "@/components/auth/orders-view";

export const metadata: Metadata = {
  title: "Riwayat Pesanan",
  robots: { index: false, follow: false },
};

export default function AccountOrdersPage() {
  return <main id="main"><OrdersView /></main>;
}
