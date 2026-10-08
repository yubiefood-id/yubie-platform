import { getApiOrigin } from "@/lib/api-origin";
import { forwardableProxyHeaders } from "./proxy-headers";

/** Server hop timeout: a hung API must never pin the web worker. */
const PROXY_TIMEOUT_MS = 15_000;

/**
 * Same-origin API proxy (ADR-012 §7–8): thin web route handlers forward to
 * apps/api on the server side, relaying cookies both ways so the browser
 * only ever talks to yubie.id (first-party cookies, no CORS). The shared
 * proxy token authenticates the web→api hop (verified server-side by
 * apps/api); ONLY the allowlisted browser headers are forwarded, and the hop
 * is time-bounded.
 */
export async function proxyApi(request: Request, path: string): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json", ...forwardableProxyHeaders(request.headers) };
  const cookie = request.headers.get("cookie");
  if (cookie) headers.cookie = cookie;
  if (process.env.API_PROXY_TOKEN) headers["x-api-proxy-token"] = process.env.API_PROXY_TOKEN;
  if (!headers["x-request-id"]) headers["x-request-id"] = crypto.randomUUID();

  let upstream: Response;
  try {
    upstream = await fetch(`${getApiOrigin()}${path}`, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text(),
      redirect: "manual",
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    if (timedOut) return Response.json({ ok: false, code: "API_TIMEOUT" }, { status: 504 });
    return Response.json({ ok: false, code: "API_UNREACHABLE" }, { status: 502 });
  }

  const responseHeaders = new Headers();
  const contentType = upstream.headers.get("content-type");
  if (contentType) responseHeaders.set("content-type", contentType);
  const requestId = upstream.headers.get("x-request-id");
  if (requestId && /^[A-Za-z0-9_-]{1,64}$/.test(requestId)) responseHeaders.set("x-request-id", requestId);
  const setCookies = typeof upstream.headers.getSetCookie === "function" ? upstream.headers.getSetCookie() : [];
  for (const setCookie of setCookies) responseHeaders.append("set-cookie", setCookie);
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}
