import PgBoss from "pg-boss";
import { checkListingHealth, FixedClock, SequentialIdGenerator } from "@yubie/application";
import { HttpLinkHealthChecker } from "@yubie/integrations";
import { closeDatabase, createWorkerRepositories } from "@yubie/persistence";
import { createChatwootClient, processAssistantJob } from "./assistant-handler.js";
import { reconcileChatwoot } from "./reconcile-handler.js";
import { deliverChatwootOutbox, processPendingOutbox } from "./reply-delivery-handler.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required for worker");
  process.exit(1);
}

const boss = new PgBoss({ connectionString: databaseUrl });
const repos = createWorkerRepositories(databaseUrl);
const checker = new HttpLinkHealthChecker();
const clock = new FixedClock(new Date().toISOString());

async function start() {
  await boss.start();
  await boss.createQueue("listing.health");
  await boss.createQueue("integration.health");
  await boss.createQueue("assistant.process");
  await boss.createQueue("chatwoot.reply");
  await boss.createQueue("chatwoot.reconcile");
  await boss.createQueue("webhook.cleanup");

  await boss.work("assistant.process", async (jobs) => {
    for (const job of jobs) {
      const inboxId = String((job.data as { inboxId?: string }).inboxId ?? "");
      if (inboxId && inboxId !== "unknown") {
        await processAssistantJob(inboxId);
        await boss.send("chatwoot.reply", { outboxSweep: true });
      }
    }
  });

  await boss.work("chatwoot.reply", async (jobs) => {
    const chatwoot = createChatwootClient();
    for (const job of jobs) {
      const outboxId = String((job.data as { outboxId?: string }).outboxId ?? "");
      if (outboxId) {
        await deliverChatwootOutbox(repos.database, chatwoot, outboxId);
      } else {
        await processPendingOutbox(repos.database, chatwoot);
      }
    }
  });

  await boss.work("chatwoot.reconcile", async () => {
    const chatwoot = createChatwootClient();
    await reconcileChatwoot(repos.database, chatwoot);
  });

  await boss.work("webhook.cleanup", async () => {
    const { PostgresWebhookInboxRepository } = await import("@yubie/persistence");
    const inbox = new PostgresWebhookInboxRepository(repos.database);
    await inbox.purgeExpiredRawBodies(new Date().toISOString());
  });

  await boss.work("listing.health", async (jobs) => {
    for (const job of jobs) {
      const listingKey = String((job.data as { listingKey?: string }).listingKey ?? "");
      await checkListingHealth(listingKey, {
        listings: repos.listings,
        health: repos.health,
        checker,
        tasks: repos.tasks,
        clock,
        requestId: `worker-${job.id}`,
      });
    }
  });

  await boss.work("integration.health", async () => {
    console.log(JSON.stringify({ level: "info", event: "integration.health", releaseSha: process.env.RELEASE_SHA ?? "dev" }));
  });

  await boss.send("integration.health", {}, { startAfter: 5 });
  await boss.schedule("chatwoot.reconcile", "*/15 * * * *", {});
  await boss.schedule("webhook.cleanup", "0 * * * *", {});

  console.log(JSON.stringify({ level: "info", event: "worker.started", releaseSha: process.env.RELEASE_SHA ?? "dev" }));
}

const shutdown = async () => {
  await boss.stop({ graceful: true, timeout: 10000 });
  await closeDatabase(repos.database);
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

start().catch((error) => {
  console.error(JSON.stringify({ level: "error", event: "worker.failed", message: String(error) }));
  process.exit(1);
});
