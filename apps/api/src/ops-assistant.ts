import {
  createDatabase,
  PostgresAssistantOutboxRepository,
  PostgresRuntimeConfigRepository,
  type Database,
} from "@yubie/persistence";

function authorizeOps(request: Request): boolean {
  const token = process.env.OPS_API_TOKEN;
  if (!token) return process.env.NODE_ENV !== "production";
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${token}`;
}

export async function handleOpsAssistant(request: Request, database: Database): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/ops/assistant")) return null;

  if (!authorizeOps(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const runtime = new PostgresRuntimeConfigRepository(database);
  const outbox = new PostgresAssistantOutboxRepository(database);

  if (request.method === "GET" && url.pathname === "/ops/assistant") {
    const config = await runtime.getSnapshot();
    const pending = await outbox.claimPending(100);
    const deadLetters = pending.filter((r) => r.status === "failed" || r.status === "ambiguous");

    return Response.json({
      mode: config.mode,
      assistantEnabled: config.assistantEnabled,
      modelVersion: config.modelVersion,
      promptVersion: config.promptVersion,
      knowledgeVersion: config.knowledgeVersion,
      allowedGreenIntents: config.allowedGreenIntents,
      queueLag: pending.length,
      deadLetters: deadLetters.length,
      releaseSha: process.env.RELEASE_SHA ?? "dev",
    });
  }

  if (request.method === "POST" && url.pathname === "/ops/assistant/mode") {
    const body = (await request.json()) as { mode?: string; changedBy?: string };
    const allowed = ["off", "shadow", "suggestion", "auto"];
    if (!body.mode || !allowed.includes(body.mode)) {
      return Response.json({ error: "invalid_mode" }, { status: 400 });
    }
    await runtime.set("mode", body.mode, body.changedBy ?? "operator", new Date().toISOString());
    if (body.mode === "off") {
      await runtime.set("assistant_enabled", false, body.changedBy ?? "operator", new Date().toISOString());
    }
    return Response.json({ ok: true, mode: body.mode });
  }

  if (request.method === "POST" && url.pathname === "/ops/assistant/emergency-off") {
    const body = (await request.json()) as { changedBy?: string };
    const changedBy = body.changedBy ?? "operator";
    const now = new Date().toISOString();
    await runtime.set("assistant_enabled", false, changedBy, now);
    await runtime.set("mode", "off", changedBy, now);
    return Response.json({ ok: true, assistantEnabled: false });
  }

  return Response.json({ error: "not_found" }, { status: 404 });
}
