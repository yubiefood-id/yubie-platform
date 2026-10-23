/** CAPTCHA verifies request risk only; it never proves ownership of a phone. */
export class TurnstileVerifier {
  constructor(private readonly secret: string, private readonly hostname: string, private readonly fetchFn: typeof fetch = fetch) {}
  async verify(token: string, ip: string): Promise<boolean> {
    if (!token || token.length > 2048 || !this.secret || !this.hostname) return false;
    try {
      const response = await this.fetchFn("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", redirect: "error", signal: AbortSignal.timeout(5000), body: new URLSearchParams({ secret: this.secret, response: token, remoteip: ip }) });
      if (!response.ok) return false;
      const data = await response.json() as { success?: boolean; hostname?: string; action?: string };
      return data.success === true && data.hostname === this.hostname && data.action === "phone_auth";
    } catch { return false; }
  }
}
