import { createHmac, randomBytes } from "node:crypto";
import { tokensMatch, type CustomerProof } from "@yubie/application";
import type { AppContext } from "./composition/create-app.js";
import type { DeliveryPinInput } from "@yubie/domain";
const localCsrfKey = randomBytes(32).toString("hex");
const customerKey = () => process.env.API_PROXY_TOKEN || process.env.OTP_HASH_SECRET || localCsrfKey;
export function customerCookie(request: Request, name: string): string | null {
  const raw = request.headers.get("cookie")?.split(";").map(c => c.trim()).find(c => c.startsWith(name + "="))?.slice(name.length + 1);
  if (!raw || raw.length > 256) return null;
  try { return decodeURIComponent(raw); } catch { return null; }
}
function csrf(browser: string): string {
  return createHmac("sha256", customerKey()).update("customer-csrf:" + browser).digest("hex");
}
function pinSignature(payload: string): string { return createHmac("sha256", customerKey()).update("delivery-pin:" + payload).digest("hex"); }
function pinBrowser(browser: string): string { return createHmac("sha256", customerKey()).update("delivery-pin-browser:" + browser).digest("hex"); }
/** Receipt is issued only after an ID-country provider result; never a login credential. */
export function issueCustomerPinToken(point: { latitude: number; longitude: number }, browser: string, ctx: AppContext): string {
  const issued = Date.parse(ctx.clock.now());
  const payload = Buffer.from(JSON.stringify({ latitude: point.latitude, longitude: point.longitude, countryCode: "ID", browser: pinBrowser(browser), issued, expires: issued + 300_000 })).toString("base64url");
  return payload + "." + pinSignature(payload);
}
export function verifyCustomerPin(pin: DeliveryPinInput, browser: string, ctx: AppContext): boolean {
  const value = pin.validationToken;
  if (!value || value.length > 2048) return false;
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra || !/^[A-Za-z0-9_-]+$/.test(payload) || !/^[a-f0-9]{64}$/.test(signature) || !tokensMatch(signature, pinSignature(payload))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")), now = Date.parse(ctx.clock.now());
    return data.countryCode === "ID" && data.browser === pinBrowser(browser) && data.latitude === pin.latitude && data.longitude === pin.longitude && Number.isFinite(data.issued) && Number.isFinite(data.expires) && data.issued <= now && data.expires > now && data.expires - data.issued === 300_000;
  } catch { return false; }
}
export function customerBootstrap(request: Request, ctx: AppContext) {
  const found = customerCookie(request, "yubie_browser"), existing = found && /^[A-Za-z0-9_-]{43}$/.test(found) ? found : null;
  const browser = existing ?? randomBytes(32).toString("base64url");
  return { browser, csrfToken: csrf(browser), headers: { "cache-control": "no-store", "set-cookie": `yubie_browser=${browser}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${(ctx.appOrigin ?? new URL(request.url).origin).startsWith("https:") ? "; Secure" : ""}` } };
}
export function authorizeCustomerMutation(request: Request, ctx: AppContext): string | null {
  const browser = customerCookie(request, "yubie_browser"), token = request.headers.get("x-csrf-token") ?? "";
  const origin = request.headers.get("x-yubie-browser-origin") ?? request.headers.get("origin");
  const expected = ctx.appOrigin ?? new URL(request.url).origin;
  if (!browser || !/^[A-Za-z0-9_-]{43}$/.test(browser) || origin !== expected || request.headers.get("sec-fetch-site") === "cross-site" || !/^[a-f0-9]{64}$/.test(token) || !tokensMatch(token, csrf(browser))) return null;
  return browser;
}
export async function currentCustomerProof(request: Request, ctx: AppContext): Promise<CustomerProof | undefined> {
  const token = customerCookie(request, "yubie_session"); if (!token) return undefined;
  const sessionHash = ctx.tokens.hash(token), found = await ctx.authSessions.findByTokenHash(sessionHash);
  if (!found.ok) throw new Error("CUSTOMER_STORAGE_UNAVAILABLE");
  const s = found.value;
  return s && !s.revokedAt && Date.parse(s.expiresAt) > Date.parse(ctx.clock.now()) ? { userId: s.userId, authenticatedAt: s.createdAt, sessionHash } : undefined;
}
export function customerSessionCookie(token: string, expiresAt: string, ctx: AppContext): string {
  const maxAge = Math.max(0, Math.floor((Date.parse(expiresAt) - Date.parse(ctx.clock.now())) / 1000));
  return `yubie_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${ctx.appOrigin?.startsWith("https:") ? "; Secure" : ""}`;
}
