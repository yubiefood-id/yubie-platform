import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase, closeDatabase, PostgresAdminReaders, PostgresAdminSessionRepository, PostgresAuditRepository } from "@yubie/persistence";
import { GoogleIdTokenVerifier } from "@yubie/integrations";
import { handleAdminRequest, type AdminServerOptions } from "./server.js";
import type { AdminRole } from "./rbac.js";

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
  return async (incoming: IncomingMessage, outgoing: ServerResponse) => {
    try {
      const url = new URL(incoming.url || "/", origin);
      if (url.origin !== origin) { outgoing.writeHead(400); outgoing.end(); return; }
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
          if (size > 16_384) { outgoing.writeHead(413, securityHeaders); outgoing.end(); return; }
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

export async function startAdmin(env: NodeJS.ProcessEnv = process.env) {
  const origin = new URL(env.ADMIN_ORIGIN || "");
  if (origin.protocol !== "https:" || origin.origin !== env.ADMIN_ORIGIN) throw new Error("ADMIN_ORIGIN must be the approved HTTPS origin");
  if (!env.DATABASE_URL || !env.ADMIN_GOOGLE_CLIENT_ID || !env.ADMIN_SESSION_SECRET || env.ADMIN_SESSION_SECRET.length < 32 || !env.ADMIN_STAFF_SUBJECT_ROLES) throw new Error("Admin database, separate staff OIDC, role mapping and session secret are required");
  if (env.GOOGLE_CLIENT_ID && env.ADMIN_GOOGLE_CLIENT_ID === env.GOOGLE_CLIENT_ID) throw new Error("Staff and customer OAuth clients must be separate");
  const staffRoles: unknown = JSON.parse(env.ADMIN_STAFF_SUBJECT_ROLES);
  if (!staffRoles || typeof staffRoles !== "object" || Array.isArray(staffRoles) || !Object.keys(staffRoles).length || Object.entries(staffRoles).some(([sub, role]) => !/^[A-Za-z0-9_-]{1,255}$/.test(sub) || !["viewer", "operator", "finance"].includes(String(role)))) throw new Error("ADMIN_STAFF_SUBJECT_ROLES must contain approved subject-to-role mappings");
  const port = Number(env.ADMIN_PORT || 4174);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid ADMIN_PORT");
  const database = createDatabase(env.DATABASE_URL);
  const verifier = new GoogleIdTokenVerifier({ clientId: env.ADMIN_GOOGLE_CLIENT_ID });
  const readers = new PostgresAdminReaders(database);
  const audit = new PostgresAuditRepository(database);
  const sessions = new PostgresAdminSessionRepository(database);
  const options = () => ({ sessionSecret: env.ADMIN_SESSION_SECRET!, googleClientId: env.ADMIN_GOOGLE_CLIENT_ID!, staffRoles: staffRoles as Record<string, AdminRole>, verifier, readers, audit, sessions, nowMs: Date.now() });
  const server = createServer(adminHttpHandler(options, origin.origin, fileURLToPath(new URL("./public/", import.meta.url))));
  try {
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, env.ADMIN_HOST || "127.0.0.1", resolve); });
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
