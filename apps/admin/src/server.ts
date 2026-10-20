import { authorize, type AdminRole } from "./rbac.js";
import { issueAdminSession, readAdminSession } from "./session.js";

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
  listOrders(query: { limit: number; cursor: string | null }): Promise<AdminPage<AdminOrderRow>>;
  listPayments(query: { limit: number; cursor: string | null }): Promise<AdminPage<AdminPaymentRow>>;
}

export interface AdminServerOptions {
  sessionSecret: string;
  nowMs: number;
  readers?: AdminReaders;
}

/**
 * Operator BFF. The browser never receives Postgres, ERPNext, or a bearer token.
 * Cloudflare Access remains a separate gate and is not a substitute for this check.
 * ops-staging.yubiefood.com is not deployed from this package.
 *
 * Refine UI pin, checked 2026-10-19 against React 19 peers and not installed:
 * @refinedev/core 5.0.12, @refinedev/react-router 2.0.4.
 * Those packages are UI adapters. Authorization stays in authorize().
 */
export const REFINE_COMPATIBILITY_PIN = {
  react: "19.2.6",
  next: "16.2.6",
  "@refinedev/core": "5.0.12",
  "@refinedev/react-router": "2.0.4",
  installed: false,
} as const;

export async function handleAdminRequest(request: Request, options: AdminServerOptions): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/healthz") {
    return json({ ok: true, data: { service: "admin-bff", deployed: false, refine: REFINE_COMPATIBILITY_PIN.installed } });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    if (!csrfMatches(request)) return json({ ok: false, code: "CSRF" }, { status: 403 });
  }
  const token = readCookie(request, "yubie_ops");
  const session = token ? readAdminSession(token, options.sessionSecret, options.nowMs) : null;
  if (!session) return json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
  if (authorize(session.role, request.method, url.pathname) !== "allow") {
    return json({ ok: false, code: "FORBIDDEN" }, { status: 403 });
  }
  const query = pageQuery(url);
  if ("error" in query) return json({ ok: false, code: "VALIDATION" }, { status: 400 });
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
  return json({ ok: false, code: "FORBIDDEN" }, { status: 403 });
}

function pageQuery(url: URL): { limit: number; cursor: string | null } | { error: "limit" | "cursor" } {
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit === null ? 20 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) return { error: "limit" };
  const cursor = url.searchParams.get("cursor");
  if (cursor !== null && !/^[A-Za-z0-9_-]{1,80}$/.test(cursor)) return { error: "cursor" };
  return { limit, cursor };
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
    return decodeURIComponent(trimmed.slice(eq + 1));
  }
  return null;
}

function json(body: unknown, init?: { status?: number }): Response {
  return Response.json(body, { status: init?.status ?? 200 });
}

export type { AdminRole };
