import { createServer } from "node:http";
import { snapshotMetrics } from "./metrics.js";

export function startMetricsServer(port = Number(process.env.WORKER_METRICS_PORT ?? 8789)) {
  const server = createServer((incoming, outgoing) => {
    if (incoming.url === "/healthz") {
      outgoing.writeHead(200, { "content-type": "application/json" });
      outgoing.end(JSON.stringify({ status: "ok" }));
      return;
    }
    if (incoming.url === "/metrics") {
      outgoing.writeHead(200, { "content-type": "application/json" });
      outgoing.end(JSON.stringify(snapshotMetrics()));
      return;
    }
    outgoing.writeHead(404);
    outgoing.end("not found");
  });

  server.listen(port, () => {
    console.log(JSON.stringify({ level: "info", event: "worker.metrics.listening", port }));
  });

  return server;
}
