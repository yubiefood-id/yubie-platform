import { createServer } from "node:http";
import { Readable } from "node:stream";
import { handleRequest } from "./index.js";

const port = Number(process.env.PORT ?? 8787);

createServer(async (incoming, outgoing) => {
  const origin = `http://${incoming.headers.host ?? `localhost:${port}`}`;
  const body = incoming.method === "GET" || incoming.method === "HEAD" ? undefined : Readable.toWeb(incoming);
  const request = new Request(new URL(incoming.url ?? "/", origin), { method: incoming.method, headers: incoming.headers as HeadersInit, body, duplex: body ? "half" : undefined } as RequestInit);
  const response = await handleRequest(request);
  outgoing.writeHead(response.status, Object.fromEntries(response.headers));
  outgoing.end(Buffer.from(await response.arrayBuffer()));
}).listen(port, () => {
  console.log(`Yubie API listening on http://localhost:${port}`);
});
