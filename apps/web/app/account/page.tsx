import { directCommerce } from "@/config/launch";
import { CommerceUnavailable } from "@/components/commerce/unavailable";
import type { Metadata } from "next";
import { AccountView } from "@/components/auth/account-view";

export const metadata: Metadata = {
  title: "Akun Saya",
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  if (!directCommerce) return <CommerceUnavailable />;
  return <main id="main"><AccountView /></main>;
}
