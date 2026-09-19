import type { ChatwootClient } from "@yubie/integrations";
import {
  PostgresConversationSessionRepository,
  PostgresReconcileCheckpointRepository,
  PostgresWebhookInboxRepository,
  type Database,
} from "@yubie/persistence";
import { createChatwootClient } from "./assistant-handler.js";

const OVERLAP_MS = 5 * 60 * 1000;

export interface ReconcileMetrics {
  lagMs: number;
  durationMs: number;
  scanned: number;
  changed: number;
  errors: number;
  lastSuccess: string;
}

export async function reconcileChatwoot(database: Database, chatwoot: ChatwootClient): Promise<ReconcileMetrics> {
  const started = Date.now();
  const checkpoints = new PostgresReconcileCheckpointRepository(database);
  const sessions = new PostgresConversationSessionRepository(database);
  const inbox = new PostgresWebhookInboxRepository(database);

  const cursor = await checkpoints.getCursor("chatwoot");
  const since = cursor
    ? new Date(new Date(cursor).getTime() - OVERLAP_MS).toISOString()
    : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  let scanned = 0;
  let changed = 0;
  let errors = 0;
  let latestCursor = cursor ?? since;

  try {
    const conversations = await chatwoot.listConversationsUpdatedSince(since);
    for (const conv of conversations) {
      scanned += 1;
      if (conv.updatedAt > latestCursor) latestCursor = conv.updatedAt;

      const status = await chatwoot.getConversationStatus(conv.id);
      const session = await sessions.getByChatwootId(conv.id);
      const localState = session.ok && session.value ? session.value.state : "BOT_ELIGIBLE";
      const remoteHuman = status.status === "open";

      if (remoteHuman && localState !== "HUMAN_ACTIVE") {
        await sessions.updateState(conv.id, "HUMAN_ACTIVE", new Date().toISOString());
        changed += 1;
      }
    }

    await inbox.purgeExpiredRawBodies(new Date().toISOString());
    await checkpoints.saveCursor("chatwoot", latestCursor, new Date().toISOString());
  } catch {
    errors += 1;
  }

  const metrics: ReconcileMetrics = {
    lagMs: Date.now() - new Date(since).getTime(),
    durationMs: Date.now() - started,
    scanned,
    changed,
    errors,
    lastSuccess: new Date().toISOString(),
  };

  console.log(JSON.stringify({ event: "chatwoot.reconcile", ...metrics }));
  return metrics;
}

export async function reconcileChatwootJob() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL required");
  const { createDatabase } = await import("@yubie/persistence");
  const database = createDatabase(databaseUrl);
  const chatwoot = createChatwootClient();
  return reconcileChatwoot(database, chatwoot);
}
