import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createSecureServer } from "node:https";
import { readFile } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase, closeDatabase, PostgresAdminReaders, PostgresAdminSessionRepository, PostgresAuditRepository, PostgresOperations } from "@yubie/persistence";
import { GoogleIdTokenVerifier } from "@yubie/integrations";
import { handleAdminRequest, type AdminServerOptions } from "./server.js";

const securityHeaders = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "same-origin",
  "x-frame-options": "DENY",
  "content-security-policy": "default-src 'self'; script-src 'self' https://accounts.google.com/gsi/client; style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style; frame-src https://accounts.google.com; connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
};

/** Node adapter, also used by isolated tests with real policy and injected providers. */
export function adminHttpHandler(options: () => AdminServerOptions, origin: string, assetsDirectory: string) {
  const assets = resolve(assetsDirectory);
  const rate = new Map<string, { start: number; count: number }>();
  return async (incoming: IncomingMessage, outgoing: ServerResponse) => {
    try {
      const url = new URL(incoming.url || "/", origin);
      if (url.origin !== origin) { outgoing.writeHead(400); outgoing.end(); return; }
      const now = Date.now(), address = incoming.socket.remoteAddress || "unknown";
      const category = url.pathname === "/auth/google" ? "login" : incoming.method !== "GET" && incoming.method !== "HEAD" ? "write" : url.pathname.startsWith("/v1/") || url.pathname.startsWith("/auth/") ? "read" : "asset";
      const budget = category === "login" ? 20 : category === "write" ? 60 : 120;
      const bucket = address+":"+category;
      for (const [key, value] of rate) if (now - value.start > 60_000) rate.delete(key);
      const counter = rate.get(bucket) ?? { start: now, count: 0 }; counter.count++; rate.set(bucket, counter);
      if (counter.count > budget || rate.size > 1000) { outgoing.writeHead(429, { ...securityHeaders, "retry-after": "60" }); outgoing.end(); return; }
      let response: Response;
      if (incoming.method === "GET" && (url.pathname === "/" || url.pathname.startsWith("/assets/"))) {
        const path = url.pathname === "/" ? resolve(assets, "index.html") : resolve(assets, `.${decodeURIComponent(url.pathname)}`);
        if (!path.startsWith(assets + sep)) { outgoing.writeHead(404); outgoing.end(); return; }
        const content = await readFile(path);
        const contentType = ({ ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" } as Record<string, string>)[extname(path)] || "application/octet-stream";
        response = new Response(content, { headers: { "content-type": contentType } });
      } else {
        const headers = new Headers();
        for (const [key, value] of Object.entries(incoming.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of incoming) {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          size += buffer.length;
          if (size > (url.pathname.startsWith("/v1/") ? 131_072 : 16_384)) { outgoing.writeHead(413, securityHeaders); outgoing.end(); return; }
          chunks.push(buffer);
        }
        response = await handleAdminRequest(new Request(url, { method: incoming.method || "GET", headers, ...(size ? { body: Buffer.concat(chunks) } : {}) }), options());
      }
      outgoing.writeHead(response.status, { ...securityHeaders, ...Object.fromEntries(response.headers), ...(response.headers.getSetCookie().length ? { "set-cookie": response.headers.getSetCookie() } : {}) });
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      const missing = typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
      outgoing.writeHead(missing ? 404 : 503, securityHeaders);
      outgoing.end(JSON.stringify({ ok: false, code: missing ? "NOT_FOUND" : "UNAVAILABLE" }));
    }
  };
}

export function adminRuntimeConfig(env: NodeJS.ProcessEnv) {
  if (["IPAYMU_VA", "IPAYMU_API_KEY", "XENDIT_SECRET_KEY", "API_PROXY_TOKEN", "OPS_API_TOKEN", "SMSGATE_PASSWORD", "ZAMMAD_API_TOKEN"].some(key => Boolean(env[key]))) throw new Error("Admin must not receive payment provider or customer-service secrets");
  const origin = new URL(env.ADMIN_ORIGIN || "");
  if (origin.protocol !== "https:" || origin.origin !== env.ADMIN_ORIGIN) throw new Error("ADMIN_ORIGIN must be the approved HTTPS origin");
  if (!env.DATABASE_URL || !env.ADMIN_GOOGLE_CLIENT_ID || !env.ADMIN_SESSION_SECRET || env.ADMIN_SESSION_SECRET.length < 32) throw new Error("Admin database, separate staff OIDC and session secret are required");
  if (env.GOOGLE_CLIENT_ID && env.ADMIN_GOOGLE_CLIENT_ID === env.GOOGLE_CLIENT_ID) throw new Error("Staff and customer OAuth clients must be separate");
  if (env.ADMIN_WRITES_ENABLED && !["true", "false"].includes(env.ADMIN_WRITES_ENABLED)) throw new Error("ADMIN_WRITES_ENABLED must be true or false");
  const writesEnabled = env.ADMIN_WRITES_ENABLED === "true";
  const checkoutAdmission = env.YUBIE_CHECKOUT_ADMISSION ?? "unknown";
  if (writesEnabled && !["enabled", "disabled"].includes(checkoutAdmission)) throw new Error("Authoritative checkout admission posture required");
  if ((env.ADMIN_TLS_CERT_FILE && !env.ADMIN_TLS_KEY_FILE) || (!env.ADMIN_TLS_CERT_FILE && env.ADMIN_TLS_KEY_FILE) || (env.YUBIE_ENV === "production" && !env.ADMIN_TLS_KEY_FILE)) throw new Error("Private production admin requires direct TLS certificate and key");
  const port = Number(env.ADMIN_PORT || 4174);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid ADMIN_PORT");
  return { origin, port, host: env.ADMIN_HOST || "127.0.0.1", writesEnabled, checkoutAdmission };
}

export async function startAdmin(env: NodeJS.ProcessEnv = process.env) {
  const { origin, port, host, writesEnabled, checkoutAdmission } = adminRuntimeConfig(env);
  const database = createDatabase(env.DATABASE_URL!);
  const verifier = new GoogleIdTokenVerifier({ clientId: env.ADMIN_GOOGLE_CLIENT_ID! });
  const readers = new PostgresAdminReaders(database);
  const audit = new PostgresAuditRepository(database);
  const sessions = new PostgresAdminSessionRepository(database);
  const operations = new PostgresOperations(database, { writesEnabled, checkoutAdmission, ...(env.YUBIE_ENV ? { environment: env.YUBIE_ENV } : {}) });
  const options = () => ({ operations, releaseSha: env.RELEASE_SHA || "dev", ready: async () => { await database.client`SELECT 1 FROM ops_staff_grants LIMIT 1`; }, sessionSecret: env.ADMIN_SESSION_SECRET!, googleClientId: env.ADMIN_GOOGLE_CLIENT_ID!, verifier, readers, audit, sessions, nowMs: Date.now() });
  const handler = adminHttpHandler(options, origin.origin, fileURLToPath(new URL("./public/", import.meta.url)));
  const server = env.ADMIN_TLS_CERT_FILE && env.ADMIN_TLS_KEY_FILE
    ? createSecureServer({ cert: await readFile(env.ADMIN_TLS_CERT_FILE), key: await readFile(env.ADMIN_TLS_KEY_FILE), minVersion: "TLSv1.2" }, handler)
    : createServer(handler);
  try {
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, host, resolve); });
  } catch (error) {
    await closeDatabase(database);
    throw error;
  }
  return { server, async close() { await new Promise<void>((resolve) => server.close(() => resolve())); await closeDatabase(database); } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startAdmin().then((runtime) => {
    console.log(JSON.stringify({ event: "admin.started", releaseSha: process.env.RELEASE_SHA || "dev" }));
    for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => { void runtime.close().then(() => process.exit(0)); });
  }).catch(() => { console.error(JSON.stringify({ event: "admin.config_or_startup_failed" })); process.exit(1); });
}
