import PgBoss from "pg-boss";
import { hashPayload, verifyChatwootWebhook, parseAgentBotEvent } from "@yubie/integrations";
import { createDatabase, PostgresWebhookInboxRepository } from "@yubie/persistence";
import { increment, snapshotMetrics } from "./metrics.js";

const webhookSecret = process.env.CHATWOOT_AGENTBOT_SECRET ?? "";
const databaseUrl = process.env.DATABASE_URL;

let bossInstance: PgBoss | null = null;

async function getBoss(): Promise<PgBoss> {
  if (!databaseUrl) throw new Error("DATABASE_URL required");
  if (!bossInstance) {
    bossInstance = new PgBoss({ connectionString: databaseUrl });
    await bossInstance.start();
    await bossInstance.createQueue("assistant.process");
  }
  return bossInstance;
}

async function readRawBody(request: Request): Promise<Buffer> {
  const arrayBuffer = await request.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/healthz") {
    return Response.json({ status: "ok", service: "yubie-bot" });
  }

  if (request.method === "GET" && url.pathname === "/readyz") {
    if (!databaseUrl) {
      return Response.json({ ready: false, reason: "no_database" }, { status: 503 });
    }
    return Response.json({ ready: true });
  }

  if (request.method === "GET" && url.pathname === "/metrics") {
    return Response.json(snapshotMetrics());
  }

  if (request.method === "POST" && url.pathname === "/webhooks/chatwoot-agentbot") {
    increment("bot_webhook_received_total");
    const rawBody = await readRawBody(request);
    const verify = verifyChatwootWebhook({
      rawBody,
      signature: request.headers.get("x-chatwoot-signature"),
      timestamp: request.headers.get("x-chatwoot-timestamp"),
      secret: webhookSecret,
    });
    if (!verify.ok) {
      increment("bot_webhook_rejected_total");
      return Response.json({ error: verify.reason }, { status: verify.reason === "body_too_large" ? 413 : 401 });
    }

    if (!databaseUrl) {
      return Response.json({ error: "database_unavailable" }, { status: 503 });
    }

    const database = createDatabase(databaseUrl);
    const inbox = new PostgresWebhookInboxRepository(database);
    const deliveryId = request.headers.get("x-chatwoot-delivery") ?? undefined;
    let eventType = "unknown";
    let conversationRef: string | undefined;
    let messageRef: string | undefined;
    let contactRef: string | undefined;
    let inboxRef: string | undefined;
    let providerTimestamp: string | undefined;

    try {
      const parsed = JSON.parse(rawBody.toString("utf8")) as { event?: string };
      eventType = parsed.event ?? "unknown";
      const normalized = parseAgentBotEvent(parsed as import("@yubie/integrations").AgentBotWebhookEvent);
      if (normalized) {
        conversationRef = normalized.conversationId;
        messageRef = normalized.messageId;
        contactRef = normalized.contactId;
        inboxRef = normalized.inboxId;
        providerTimestamp = normalized.receivedAt;
      }
    } catch {
      increment("bot_webhook_rejected_total");
      return Response.json({ error: "invalid_json" }, { status: 400 });
    }

    const receivedAt = new Date().toISOString();
    const insert = await inbox.insert({
      provider: "chatwoot_agentbot",
      ...(deliveryId ? { deliveryId, dedupeKey: deliveryId } : {}),
      eventType,
      payloadHash: hashPayload(rawBody),
      rawBody: rawBody.toString("utf8"),
      ...(conversationRef ? { conversationRef } : {}),
      ...(messageRef ? { messageRef } : {}),
      ...(contactRef ? { contactRef } : {}),
      ...(inboxRef ? { inboxRef } : {}),
      ...(providerTimestamp ? { providerTimestamp } : {}),
      receivedAt,
    });

    if (insert.ok && insert.value.status === "duplicate") {
      increment("bot_webhook_duplicate_total");
      return Response.json({ status: "duplicate" }, { status: 200 });
    }

    if (insert.ok && insert.value.status === "inserted") {
      const boss = await getBoss();
      await boss.send("assistant.process", { inboxId: insert.value.id });
    }

    return Response.json({ status: "accepted" }, { status: 202 });
  }

  return Response.json({ error: "not_found" }, { status: 404 });
}
