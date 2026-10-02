"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";

type LoginPhase = "loading" | "ready" | "unconfigured" | "authenticated" | "submitting" | "failed";

interface GoogleAccounts {
  accounts: {
    id: {
      initialize(config: { client_id: string; callback: (response: { credential: string }) => void }): void;
      renderButton(parent: HTMLElement, options: Record<string, string | number>): void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleAccounts;
  }
}

/**
 * Sign in with Google (authentication only — no Drive/Calendar/Gmail
 * scopes). The GIS credential is POSTed to our same-origin proxy where the
 * server validates signature/issuer/audience/expiry and exchanges it for a
 * Yubie HttpOnly session. A client-side CSRF token is double-submitted via
 * the g_csrf_token cookie + body, matching the API's GIS contract.
 */
export function LoginView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/account";
  const [phase, setPhase] = useState<LoginPhase>("loading");
  const [clientId, setClientId] = useState<string | null>(null);
  const [gisLoaded, setGisLoaded] = useState(false);
  const buttonHost = useRef<HTMLDivElement | null>(null);

  const handleCredential = useCallback(async (response: { credential: string }) => {
    setPhase("submitting");
    trackEvent("login_start", { provider: "google" });
    // Double-submit CSRF: same value in cookie and body.
    const csrfToken = crypto.randomUUID();
    document.cookie = `g_csrf_token=${csrfToken}; Path=/; SameSite=Lax; Max-Age=600`;
    try {
      const request = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ credential: response.credential, g_csrf_token: csrfToken }),
      });
      const payload = await request.json().catch(() => null);
      if (!request.ok || !payload?.ok) {
        trackEvent("login_failed", { provider: "google" });
        setPhase("failed");
        return;
      }
      trackEvent("login_success", { provider: "google" });
      router.replace(next.startsWith("/") ? next : "/account");
    } catch {
      trackEvent("login_failed", { provider: "google" });
      setPhase("failed");
    }
  }, [next, router]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/auth/session");
        const payload = await response.json().catch(() => null);
        if (cancelled) return;
        if (payload?.data?.authenticated) { setPhase("authenticated"); return; }
        if (typeof payload?.data?.googleClientId === "string" && payload.data.googleClientId.length > 0) {
          setClientId(payload.data.googleClientId);
          setPhase("ready");
        } else {
          setPhase("unconfigured");
        }
      } catch {
        if (!cancelled) setPhase("unconfigured");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (phase !== "ready" || !clientId || !gisLoaded || !window.google || !buttonHost.current) return;
    if (buttonHost.current.childElementCount > 0) return;
    window.google.accounts.id.initialize({ client_id: clientId, callback: handleCredential });
    window.google.accounts.id.renderButton(buttonHost.current, { theme: "outline", size: "large", text: "continue_with", shape: "pill", locale: "id" });
  }, [phase, clientId, gisLoaded, handleCredential]);

  return <div className="login-page">
    <header><span className="eyebrow">AKUN YUBIE</span><h1>Selamat datang<br /><em>kembali.</em></h1></header>
    <div className="login-panel">
      {phase === "loading" && <p className="checkout-note" role="status">Memuat opsi masuk…</p>}
      {phase === "authenticated" && <div role="status"><p>Anda sudah masuk.</p><Link className="button primary" href="/account">Buka akun saya <span>→</span></Link></div>}
      {phase === "ready" && clientId && <>
        <p>Masuk untuk melihat riwayat pesanan dan mempercepat checkout berikutnya. Checkout tetap bisa dilakukan sebagai tamu.</p>
        <div ref={buttonHost} />
        <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={() => setGisLoaded(true)} />
      </>}
      {phase === "submitting" && <p className="checkout-note" role="status">Memverifikasi kredensial Google…</p>}
      {phase === "failed" && <p className="checkout-error" role="alert">Masuk gagal. Coba lagi.</p>}
      {phase === "unconfigured" && <div role="status">
        <strong>Sign-in Google sedang disiapkan.</strong>
        <p>Anda tetap dapat checkout sebagai tamu kapan saja.</p>
        <Link className="button primary" href="/products">Lanjut belanja <span>→</span></Link>
      </div>}
      <p className="checkout-note">Dengan masuk, Anda menyetujui <Link href="/privacy">Privacy Policy</Link> Yubie.</p>
    </div>
  </div>;
}
