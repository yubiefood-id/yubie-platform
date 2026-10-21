/** Local acceptance host for the generated Vercel output; never a production service. */
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { verifyCatalogOutput } from "./catalog-artifact.mjs";

const output = resolve(".vercel/output");
await verifyCatalogOutput(output);
const root = resolve(output, "static");
const config = JSON.parse(await readFile(resolve(output, "config.json"), "utf8"));
const port = Number(process.env.CATALOG_PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid catalog acceptance port");
const types = { ".html": "text/html; charset=utf-8", ".rsc": "text/x-component", ".json": "application/json; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".mp4": "video/mp4", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml; charset=utf-8" };
async function file(pathname) {
  const path = resolve(root, `.${pathname}`);
  if (!path.startsWith(root + sep)) return null;
  try { return (await stat(path)).isFile() ? path : null; } catch { return null; }
}

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    const pathname = decodeURIComponent(url.pathname);
    const hostname = (request.headers.host || "").split(":")[0];
    let target;
    let status = 200;
    for (const route of config.routes) {
      if (route.handle === "filesystem") {
        target = await file(pathname);
        if (target) break;
        continue;
      }
      if (!new RegExp(route.src).test(pathname)) continue;
      if (route.has?.some((condition) => condition.type !== "host" || !condition.value.ninc || condition.value.ninc.includes(hostname))) continue;
      for (const [name, value] of Object.entries(route.headers || {})) response.setHeader(name, value);
      if (route.continue) continue;
      status = route.status || 200;
      target = await file(route.dest);
      break;
    }
    if (!target) { response.writeHead(404); response.end(); return; }
    if (!["GET", "HEAD"].includes(request.method) && status !== 503) { response.writeHead(405, { "Allow": "GET, HEAD", "Cache-Control": "no-store" }); response.end(); return; }
    response.setHeader("Content-Type", types[extname(target)] || "application/octet-stream");
    response.writeHead(status);
    if (request.method === "HEAD") response.end();
    else createReadStream(target).on("error", () => response.destroy()).pipe(response);
  } catch { response.writeHead(400, { "Cache-Control": "no-store" }); response.end(); }
}).listen(port, "127.0.0.1", () => console.log(`Catalog artifact acceptance host: http://127.0.0.1:${port}`));
