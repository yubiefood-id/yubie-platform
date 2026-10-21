import { authorize, type AdminRole } from "./rbac.js";
import { issueAdminSession, readAdminSession } from "./session.js";
import { createHash, randomBytes } from "node:crypto";
import type { AuditRepository, GoogleCredentialVerifier } from "@yubie/application";

export { issueAdminSession };

export interface AdminOrderRow {
  id: string;
  checkoutRef: string;
  status: string;
  amount: number;
  currency: "IDR";
}

export interface AdminPaymentRow {
  id: string;
  orderId: string;
  status: string;
  amount: number;
  currency: "IDR";
  reconciliationState: string;
}

export interface AdminPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface AdminReaders {
  listOrders(query: AdminQuery): Promise<AdminPage<AdminOrderRow>>;
  listPayments(query: AdminQuery): Promise<AdminPage<AdminPaymentRow>>;
  listExceptions?(query: AdminQuery): Promise<AdminPage<AdminPaymentRow>>;
  listInventory?(query: AdminQuery): Promise<AdminPage<AdminInventoryRow>>;
}

export interface AdminQuery { limit: number; cursor: string | null; search?: string }
export interface AdminInventoryRow { id: string; productId: string; sizeId: string; quantity: number; status: string; expiryDate: string }

export interface AdminServerOptions {
  sessionSecret: string;
  nowMs: number;
  readers?: AdminReaders;
  googleClientId?: string;
  verifier?: GoogleCredentialVerifier;
  staffRoles?: Readonly<Record<string, AdminRole>>;
  audit?: AuditRepository;
  sessions?: {
    isRevoked(tokenHash: string): Promise<boolean>;
    revoke(input: { tokenHash: string; expiresAt: string; actor: string }): Promise<void>;
  };
}

/**
 * Operator BFF. The browser never receives Postgres, ERPNext, or a bearer token.
 * Cloudflare Access remains a separate gate and is not a substitute for this check.
 * ops-staging.yubiefood.com is not deployed from this package.
 *
 * Refine Core is bundled in the private UI. Authorization stays server-side;
 * the UI never receives database or provider credentials.
 */
export const REFINE_COMPATIBILITY_PIN = {
  react: "19.2.8",
  "@refinedev/core": "5.0.12",
  installed: true,
} as const;

export async function handleAdminRequest(request: Request, options: AdminServerOptions): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/healthz") {
    return json({ ok: true, data: { service: "admin-bff", deployed: false, refine: REFINE_COMPATIBILITY_PIN.installed } });
  }
  if (request.method === "GET" && url.pathname === "/auth/config") {
    const csrfToken = randomBytes(32).toString("hex");
    return json({ ok: true, data: { googleClientId: options.googleClientId ?? null, csrfToken } }, {
      headers: { "set-cookie": `yubie_ops_csrf=${csrfToken}; Path=/; HttpOnly; SameSite=Strict; Max-Age=600${url.protocol === "https:" ? "; Secure" : ""}` },
    });
  }
  if (request.method === "POST" && url.pathname === "/auth/google") {
    if (request.headers.get("origin") !== url.origin || !csrfMatches(request)) return json({ ok: false, code: "CSRF" }, { status: 403 });
    if (!options.verifier || !options.googleClientId || !options.staffRoles) return json({ ok: false, code: "UNCONFIGURED" }, { status: 503 });
    try {
      const raw = await request.text();
      if (raw.length > 16_384) return json({ ok: false, code: "VALIDATION" }, { status: 413 });
      let input: unknown;
      try { input = JSON.parse(raw); } catch { return json({ ok: false, code: "VALIDATION" }, { status: 400 }); }
      if (!input || typeof input !== "object" || !("credential" in input) || typeof input.credential !== "string") return json({ ok: false, code: "VALIDATION" }, { status: 400 });
      const identity = await options.verifier.verify(input.credential);
      if (!identity.ok) return json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
      const role = Object.hasOwn(options.staffRoles, identity.value.sub) ? options.staffRoles[identity.value.sub] : undefined;
      if (!role || identity.value.emailVerified !== true) return json({ ok: false, code: "FORBIDDEN" }, { status: 403 });
      await auditRead(options, identity.value.sub, "admin.login", "/auth/google");
      const token = issueAdminSession({ sub: identity.value.sub, role, exp: options.nowMs + 15 * 60_000 }, options.sessionSecret);
      return json({ ok: true }, { headers: { "set-cookie": `yubie_ops=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=900${url.protocol === "https:" ? "; Secure" : ""}` } });
    } catch { return json({ ok: false, code: "UNAVAILABLE" }, { status: 503 }); }
  }
  const token = readCookie(request, "yubie_ops");
  const session = token ? readAdminSession(token, options.sessionSecret, options.nowMs) : null;
  if (!session) return json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
  if (options.staffRoles && (!Object.hasOwn(options.staffRoles, session.sub) || options.staffRoles[session.sub] !== session.role)) return json({ ok: false, code: "FORBIDDEN" }, { status: 403 });
  try {
    if (options.sessions && await options.sessions.isRevoked(createHash("sha256").update(token!).digest("hex"))) return json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
    if (request.method !== "GET" && request.method !== "HEAD" && !csrfMatches(request)) {
      await auditRead(options, session.sub, "admin.denied", url.pathname);
      return json({ ok: false, code: "CSRF" }, { status: 403 });
    }
    if (url.pathname === "/auth/session" && request.method === "GET") return json({ ok: true, data: { authenticated: true, role: session.role } });
    if (url.pathname === "/auth/logout" && request.method === "POST") {
      if (request.headers.get("origin") !== url.origin || !csrfMatches(request)) return json({ ok: false, code: "CSRF" }, { status: 403 });
      if (!options.sessions) return json({ ok: false, code: "UNAVAILABLE" }, { status: 503 });
      await options.sessions.revoke({ tokenHash: createHash("sha256").update(token!).digest("hex"), expiresAt: new Date(session.exp).toISOString(), actor: session.sub });
      return json({ ok: true }, { headers: { "set-cookie": `yubie_ops=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${url.protocol === "https:" ? "; Secure" : ""}` } });
    }
  } catch { return json({ ok: false, code: "UNAVAILABLE" }, { status: 503 }); }
  if (authorize(session.role, request.method, url.pathname) !== "allow") {
    try { await auditRead(options, session.sub, "admin.denied", url.pathname); }
    catch { return json({ ok: false, code: "UNAVAILABLE" }, { status: 503 }); }
    return json({ ok: false, code: "FORBIDDEN" }, { status: 403 });
  }
  const query = pageQuery(url);
  if ("error" in query) return json({ ok: false, code: "VALIDATION" }, { status: 400 });
  try {
    await auditRead(options, session.sub, "admin.read", url.pathname);
    if (url.pathname === "/v1/orders") {
      const page = options.readers
        ? await options.readers.listOrders(query)
        : { items: [], nextCursor: null };
      return json({ ok: true, data: { orders: page.items, nextCursor: page.nextCursor, source: options.readers ? "reader" : "unconfigured", role: session.role } });
    }
    if (url.pathname === "/v1/payments") {
      const page = options.readers
        ? await options.readers.listPayments(query)
        : { items: [], nextCursor: null };
      return json({ ok: true, data: { payments: page.items, nextCursor: page.nextCursor, source: options.readers ? "reader" : "unconfigured", role: session.role } });
    }
    if (url.pathname === "/v1/exceptions" || url.pathname === "/v1/inventory") {
      const page = url.pathname === "/v1/exceptions" && options.readers?.listExceptions
        ? await options.readers.listExceptions(query)
        : url.pathname === "/v1/inventory" && options.readers?.listInventory ? await options.readers.listInventory(query) : null;
      if (!page) return json({ ok: false, code: "UNAVAILABLE" }, { status: 503 });
      return json({ ok: true, data: { items: page.items, nextCursor: page.nextCursor, source: "reader", role: session.role } });
    }
  } catch (error: unknown) {
    console.error(JSON.stringify({
      level: "error",
      event: "admin.reader_failed",
      path: url.pathname,
      errorType: error instanceof Error ? error.name : "UnknownError",
      at: new Date().toISOString(),
    }));
    return json({ ok: false, code: "UNAVAILABLE" }, { status: 503 });
  }
  return json({ ok: false, code: "FORBIDDEN" }, { status: 403 });
}

function pageQuery(url: URL): AdminQuery | { error: "limit" | "cursor" | "search" } {
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit === null ? 20 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) return { error: "limit" };
  const cursor = url.searchParams.get("cursor");
  if (cursor !== null && !/^[A-Za-z0-9_-]{1,80}$/.test(cursor)) return { error: "cursor" };
  const search = url.searchParams.get("search")?.trim();
  if (search && (search.length > 80 || /[\x00-\x1f]/.test(search))) return { error: "search" };
  return { limit, cursor, ...(search ? { search } : {}) };
}

function csrfMatches(request: Request): boolean {
  const cookie = readCookie(request, "yubie_ops_csrf");
  const header = request.headers.get("x-yubie-csrf");
  return cookie !== null && header !== null && cookie.length > 0 && cookie === header;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq) !== name) continue;
    try { return decodeURIComponent(trimmed.slice(eq + 1)); } catch { return null; }
  }
  return null;
}

async function auditRead(options: AdminServerOptions, actor: string, action: string, path: string) {
  if (!options.audit) return;
  const knownPaths = new Set(["/auth/login", "/auth/google", "/auth/logout", "/v1/orders", "/v1/payments", "/v1/exceptions", "/v1/inventory"]);
  const result = await options.audit.append({ action, actor, resourceType: "admin", resourceId: knownPaths.has(path) ? path : "unrecognized-route", occurredAt: new Date(options.nowMs).toISOString() });
  if (!result.ok) throw new Error("Audit unavailable");
}

function json(body: unknown, init?: { status?: number; headers?: Record<string, string> }): Response {
  return Response.json(body, { status: init?.status ?? 200, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff", ...init?.headers } });
}

export type { AdminRole };
