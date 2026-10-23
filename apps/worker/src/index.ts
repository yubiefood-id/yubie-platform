import PgBoss from "pg-boss";
import { inspectServiceRuntimeConfig } from "@yubie/config";
import { checkListingHealth, SystemClock } from "@yubie/application";
import { createSupportProvider, HttpLinkHealthChecker } from "@yubie/integrations";
import { closeDatabase, createWorkerRepositories, PostgresAssistantWorkRepository } from "@yubie/persistence";
import { processAssistantJob } from "./assistant-handler.js";
import { startMetricsServer } from "./metrics-server.js";
import { reconcileSupport } from "./reconcile-handler.js";
import { deliverSupportOutbox, processPendingOutbox } from "./reply-delivery-handler.js";
import { runPaymentReconcile } from "./payment-reconcile-handler.js";

// Fail closed before any queue starts processing: an invalid runtime
// configuration (unknown provider, missing Zammad values in
// staging/production, typo'd BOT_ENGINE) must stop the worker, not surface as
// a fake provider silently handling production traffic.
// Worker scope: full support contract (replies/reconciliation) + commerce
// contract (payment.reconcile) — but never API_PROXY_TOKEN or web secrets.
const startupConfig = inspectServiceRuntimeConfig(process.env, "worker");
if (!startupConfig.ok) {
  console.error(
    JSON.stringify({ level: "error", event: "worker.config_error", errors: startupConfig.errors }),
  );
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required for worker");
  process.exit(1);
}

const boss = new PgBoss({ connectionString: databaseUrl });
const repos = createWorkerRepositories(databaseUrl);
const checker = new HttpLinkHealthChecker();
const clock = new SystemClock();

async function start() {
  if (process.env.WORKER_METRICS_ENABLED !== "false") {
    startMetricsServer();
  }
  await boss.start();
  await boss.createQueue("listing.health");
  await boss.createQueue("integration.health");
  await boss.createQueue("assistant.process");
  await boss.createQueue("assistant.dead");
  await boss.createQueue("support.reply");
  await boss.createQueue("support.reconcile");
  await boss.createQueue("chatwoot.reply");
  await boss.createQueue("chatwoot.reconcile");
  await boss.createQueue("webhook.cleanup");

  await boss.work("assistant.process", async (jobs) => {
    for (const job of jobs) {
      const inboxId = String((job.data as { inboxId?: string }).inboxId ?? "");
      if (inboxId && inboxId !== "unknown") {
        await processAssistantJob(inboxId);
        await boss.send("support.reply", { outboxSweep: true });
      }
    }
  });

  const handleReply = async (jobs: Array<{ data: unknown }>) => {
    const support = createSupportProvider();
    for (const job of jobs) {
      const outboxId = String((job.data as { outboxId?: string }).outboxId ?? "");
      if (outboxId) {
        await deliverSupportOutbox(repos.database, support, outboxId);
      } else {
        await processPendingOutbox(repos.database, support);
      }
    }
  };

  await boss.work("support.reply", handleReply);
  await boss.work("chatwoot.reply", handleReply);

  const handleReconcile = async (jobs: Array<{ id: string }>) => {
    const support = createSupportProvider();
    for (const job of jobs) {
      const jobId = job.id.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 48);
      await reconcileSupport(repos.database, support, `worker_${jobId}`);
    }
  };

  await boss.work("support.reconcile", { batchSize: 1 }, handleReconcile);
  await boss.work("chatwoot.reconcile", { batchSize: 1 }, handleReconcile);

  await boss.work("webhook.cleanup", async () => {
    const { PostgresWebhookInboxRepository } = await import("@yubie/persistence");
    const inbox = new PostgresWebhookInboxRepository(repos.database);
    await inbox.purgeExpiredRawBodies(new Date().toISOString());
  });

  // First-party payment recovery (ADR-012): stale drafts, pending payments
  // past expiry, unknown provider outcomes. The handler no-ops unless
  // COMMERCE_PROVIDER=xendit is fully configured.
  await boss.createQueue("payment.reconcile");
  await boss.work("payment.reconcile", { batchSize: 1 }, async (jobs) => {
    for (const job of jobs) {
      const jobId = job.id.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 48);
      await runPaymentReconcile(repos.database, `worker_${jobId}`);
    }
  });
  await boss.schedule("payment.reconcile", "*/5 * * * *", {});

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
  await boss.schedule("support.reconcile", "*/15 * * * *", {});
  await boss.schedule("chatwoot.reconcile", "*/15 * * * *", {});
  await boss.schedule("webhook.cleanup", "0 * * * *", {});
  // Repair the durable inbox -> queue wakeup gap and retry only bounded failed events.
  let sweeping=false;
  const sweep=setInterval(async()=>{
    if(sweeping)return;
    sweeping=true;
    try {
      const provider=process.env.SUPPORT_PROVIDER??process.env.CHAT_PROVIDER??"fake";
      const inboxProvider=provider==="chatwoot"?"chatwoot_agentbot":provider;
      const work=new PostgresAssistantWorkRepository(repos.database);
      const rows=await work.backlog(inboxProvider);
      for(const row of rows)await boss.send("assistant.process",{inboxId:row.id},{singletonKey:row.id,retryLimit:4,retryDelay:30,retryBackoff:true,deadLetter:"assistant.dead"});
      await processPendingOutbox(repos.database,createSupportProvider());
      await work.purgeExpiredContext();
    }catch{console.error(JSON.stringify({event:"assistant.sweep_failed",errorCode:"SWEEP_FAILED"}));}
    finally{sweeping=false;}
  },10_000);
  sweep.unref();

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
