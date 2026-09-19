import PgBoss from "pg-boss";
import {
  buildZammadDedupeKey,
  hashPayload,
  parseAgentBotEvent,
  parseZammadTriggerPayload,
  verifyChatwootWebhook,
  verifyZammadWebhook,
} from "@yubie/integrations";
import { closeDatabase, createDatabase, PostgresWebhookInboxRepository, type Database } from "@yubie/persistence";
import { increment, snapshotMetrics } from "./metrics.js";

const databaseUrl = process.env.DATABASE_URL;

function chatwootWebhookSecret() {
  return process.env.CHATWOOT_AGENTBOT_SECRET ?? "";
}

function zammadWebhookSecret() {
  return process.env.ZAMMAD_WEBHOOK_SECRET ?? "";
}

function zammadBearerToken() {
  return process.env.ZAMMAD_WEBHOOK_BEARER ?? "";
}

let bossInstance: PgBoss | null = null;
const databaseInstances = new Set<Database>();

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

async function acceptInboxEvent(input: {
  provider: string;
  deliveryId?: string;
  eventType: string;
  providerEventType?: string;
  payloadHash: string;
  rawBody: string;
  conversationRef?: string;
  messageRef?: string;
  contactRef?: string;
  inboxRef?: string;
  providerTimestamp?: string;
}) {
  if (!databaseUrl) {
    return Response.json({ error: "database_unavailable" }, { status: 503 });
  }

  const database = createDatabase(databaseUrl);
  databaseInstances.add(database);
  const inbox = new PostgresWebhookInboxRepository(database);
  const receivedAt = new Date().toISOString();
  const insert = await inbox.insert({
    provider: input.provider,
    ...(input.deliveryId ? { deliveryId: input.deliveryId, dedupeKey: input.deliveryId } : {}),
    eventType: input.eventType,
    ...(input.providerEventType ? { providerEventType: input.providerEventType } : {}),
    payloadHash: input.payloadHash,
    rawBody: input.rawBody,
    ...(input.conversationRef ? { conversationRef: input.conversationRef } : {}),
    ...(input.messageRef ? { messageRef: input.messageRef } : {}),
    ...(input.contactRef ? { contactRef: input.contactRef } : {}),
    ...(input.inboxRef ? { inboxRef: input.inboxRef } : {}),
    ...(input.providerTimestamp ? { providerTimestamp: input.providerTimestamp } : {}),
    receivedAt,
  });

  if (insert.ok && insert.value.status === "duplicate") {
    increment("bot_webhook_duplicate_total");
    increment("zammad_webhook_duplicate_total");
    return Response.json({ status: "duplicate" }, { status: 200 });
  }

  if (insert.ok && insert.value.status === "inserted") {
    const boss = await getBoss();
    await boss.send("assistant.process", { inboxId: insert.value.id });
  }

  return Response.json({ status: "accepted" }, { status: 202 });
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
      secret: chatwootWebhookSecret(),
    });
    if (!verify.ok) {
      increment("bot_webhook_rejected_total");
      return Response.json({ error: verify.reason }, { status: verify.reason === "body_too_large" ? 413 : 401 });
    }

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

    return acceptInboxEvent({
      provider: "chatwoot_agentbot",
      ...(deliveryId ? { deliveryId } : {}),
      eventType,
      payloadHash: hashPayload(rawBody),
      rawBody: rawBody.toString("utf8"),
      ...(conversationRef ? { conversationRef } : {}),
      ...(messageRef ? { messageRef } : {}),
      ...(contactRef ? { contactRef } : {}),
      ...(inboxRef ? { inboxRef } : {}),
      ...(providerTimestamp ? { providerTimestamp } : {}),
    });
  }

  if (request.method === "POST" && url.pathname === "/webhooks/zammad") {
    increment("zammad_webhook_received_total");
    const rawBody = await readRawBody(request);
    const verify = verifyZammadWebhook({
      rawBody,
      signature: request.headers.get("x-hub-signature"),
      secret: zammadWebhookSecret(),
      ...(zammadBearerToken() ? { bearerToken: zammadBearerToken() } : {}),
      authorizationHeader: request.headers.get("authorization"),
    });
    if (!verify.ok) {
      increment("zammad_webhook_rejected_total");
      return Response.json({ error: verify.reason }, { status: verify.reason === "body_too_large" ? 413 : 401 });
    }

    const deliveryId = request.headers.get("x-zammad-delivery") ?? undefined;
    let eventType = "unknown";
    let conversationRef: string | undefined;
    let messageRef: string | undefined;
    let contactRef: string | undefined;
    let inboxRef: string | undefined;

    try {
      const parsed = JSON.parse(rawBody.toString("utf8")) as import("@yubie/integrations").ZammadTriggerPayload;
      const refs = parseZammadTriggerPayload(parsed);
      if (refs) {
        eventType = refs.eventType;
        conversationRef = refs.ticketId;
        messageRef = refs.articleId;
        contactRef = refs.customerId;
        inboxRef = refs.groupId;
      }
    } catch {
      increment("zammad_webhook_rejected_total");
      return Response.json({ error: "invalid_json" }, { status: 400 });
    }

    const payloadHash = hashPayload(rawBody);
    const dedupeKey = buildZammadDedupeKey({
      ...(deliveryId ? { deliveryId } : {}),
      provider: "zammad",
      ...(conversationRef ? { ticketId: conversationRef } : {}),
      ...(messageRef ? { articleId: messageRef } : {}),
      payloadHash,
    });

    return acceptInboxEvent({
      provider: "zammad",
      deliveryId: dedupeKey,
      eventType,
      providerEventType: eventType,
      payloadHash,
      rawBody: rawBody.toString("utf8"),
      ...(conversationRef ? { conversationRef } : {}),
      ...(messageRef ? { messageRef } : {}),
      ...(contactRef ? { contactRef } : {}),
      ...(inboxRef ? { inboxRef } : {}),
    });
  }

  return Response.json({ error: "not_found" }, { status: 404 });
}

/** Stops pg-boss and DB pools so test processes can exit cleanly. */
export async function shutdownBotRuntime() {
  if (bossInstance) {
    await bossInstance.stop({ graceful: true, timeout: 5000 });
    bossInstance = null;
  }
  for (const database of databaseInstances) {
    await closeDatabase(database);
  }
  databaseInstances.clear();
}
