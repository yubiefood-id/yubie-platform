import type { SupportConversationProvider } from "@yubie/application";
import { resolveSupportProviderName } from "@yubie/integrations";
import {
  PostgresConversationSessionRepository,
  PostgresReconcileCheckpointRepository,
  PostgresWebhookInboxRepository,
  type Database,
} from "@yubie/persistence";

const OVERLAP_MS = 5 * 60 * 1000;

export interface ReconcileMetrics {
  lagMs: number;
  durationMs: number;
  scanned: number;
  changed: number;
  errors: number;
  lastSuccess: string;
  provider: string;
}

export async function reconcileSupport(
  database: Database,
  support: SupportConversationProvider,
): Promise<ReconcileMetrics> {
  const started = Date.now();
  const provider = support.provider;
  const checkpoints = new PostgresReconcileCheckpointRepository(database);
  const sessions = new PostgresConversationSessionRepository(database);
  const inbox = new PostgresWebhookInboxRepository(database);

  const cursor = await checkpoints.getCursor(provider);
  const since = cursor
    ? new Date(new Date(cursor).getTime() - OVERLAP_MS).toISOString()
    : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  let scanned = 0;
  let changed = 0;
  let errors = 0;
  let latestCursor = cursor ?? since;

  try {
    const threads = await support.listThreadsUpdatedSince(since);
    for (const thread of threads) {
      scanned += 1;
      if (thread.updatedAt > latestCursor) latestCursor = thread.updatedAt;

      const ref = { provider, threadId: thread.threadId };
      const humanState = await support.getCurrentHumanState(ref);
      const session = await sessions.getByProviderThreadId(provider, thread.threadId);
      const localState = session.ok && session.value ? session.value.state : "BOT_ELIGIBLE";

      if (humanState.humanActive && localState !== "HUMAN_ACTIVE") {
        await sessions.updateState(provider, thread.threadId, "HUMAN_ACTIVE", new Date().toISOString());
        changed += 1;
      }
    }

    await inbox.purgeExpiredRawBodies(new Date().toISOString());
    await checkpoints.saveCursor(provider, latestCursor, new Date().toISOString());
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
    provider,
  };

  console.log(JSON.stringify({ event: "support.reconcile", ...metrics }));
  return metrics;
}

export async function reconcileSupportJob() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL required");
  const { createDatabase } = await import("@yubie/persistence");
  const { createSupportProvider } = await import("@yubie/integrations");
  const database = createDatabase(databaseUrl);
  const support = createSupportProvider();
  return reconcileSupport(database, support);
}

export const reconcileChatwoot = reconcileSupport;

export function reconcileProviderName() {
  return resolveSupportProviderName();
}
