import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Keranjang",
  robots: { index: false, follow: false },
};

export default function CartPage() {
  redirect("/shop");
}
