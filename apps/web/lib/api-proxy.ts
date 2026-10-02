import { getApiOrigin } from "@/lib/api-origin";

/**
 * Same-origin API proxy (ADR-012 §7–8): thin web route handlers forward to
 * apps/api on the server side, relaying cookies both ways so the browser
 * only ever talks to yubie.id (first-party cookies, no CORS). The optional
 * shared proxy token authenticates the web→api hop.
 */
export async function proxyApi(request: Request, path: string): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const cookie = request.headers.get("cookie");
  if (cookie) headers.cookie = cookie;
  if (process.env.API_PROXY_TOKEN) headers["x-api-proxy-token"] = process.env.API_PROXY_TOKEN;

  let upstream: Response;
  try {
    upstream = await fetch(`${getApiOrigin()}${path}`, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text(),
      redirect: "manual",
    });
  } catch {
    return Response.json({ ok: false, code: "API_UNREACHABLE" }, { status: 502 });
  }

  const responseHeaders = new Headers();
  const contentType = upstream.headers.get("content-type");
  if (contentType) responseHeaders.set("content-type", contentType);
  const setCookies = typeof upstream.headers.getSetCookie === "function" ? upstream.headers.getSetCookie() : [];
  for (const setCookie of setCookies) responseHeaders.append("set-cookie", setCookie);
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}
