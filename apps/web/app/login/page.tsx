import { directCommerce } from "@/config/launch";
import { CommerceUnavailable } from "@/components/commerce/unavailable";
import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginView } from "@/components/auth/login-view";

export const metadata: Metadata = {
  title: "Masuk",
  robots: { index: false, follow: true },
};

export default function LoginPage() {
  if (!directCommerce) return <CommerceUnavailable />;
  return <main id="main"><Suspense fallback={<div className="login-page" aria-busy="true"><p className="cart-loading">Memuat…</p></div>}><LoginView /></Suspense></main>;
}
