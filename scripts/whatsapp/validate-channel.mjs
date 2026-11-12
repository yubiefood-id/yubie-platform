#!/usr/bin/env node
// WA go-live validation harness (TAHAP 7 runbook step 2).
// Server-side PASS/BLOCKED matrix — the physical phone round-trip remains the
// owner's single manual step. Usage:
//   BOT_BASE_URL=https://bot-staging.yubie.id \
//   ZAMMAD_BASE_URL=https://support-staging.yubiefood.com \
//   DATABASE_URL=... node scripts/whatsapp/validate-channel.mjs
import { createDatabase, closeDatabase, PostgresChannelBindingRepository, PostgresAssistantOutboxRepository, PostgresRuntimeConfigRepository } from "../../packages/persistence/dist/index.js";
import { createOpsAIProviderFromEnv } from "../../packages/assistant/dist/index.js";

const results = [];
const check = (name, status, detail) => { results.push({ name, status, detail }); console.log(`${status.padEnd(8)} ${name}${detail ? ` — ${detail}` : ""}`); };

async function main() {
  const bot = (process.env.BOT_BASE_URL ?? "").replace(/\/$/, "");
  const zammad = (process.env.ZAMMAD_BASE_URL ?? "").replace(/\/$/, "");

  if (!bot) {
    check("bot/healthz", "BLOCKED", "BOT_BASE_URL not set");
  } else {
    try {
      const health = await fetch(`${bot}/healthz`);
      check("bot/healthz", health.ok ? "PASS" : "FAIL", `HTTP ${health.status}`);
      const ready = await fetch(`${bot}/readyz`);
      const body = await ready.json().catch(() => ({}));
      check("bot/readyz (config+db)", ready.status === 200 ? "PASS" : "FAIL", ready.status === 200 ? "ready" : JSON.stringify(body).slice(0, 120));
      const webhook = await fetch(`${bot}/webhooks/zammad`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      check("bot/webhooks/zammad rejects unauthenticated", webhook.status === 401 ? "PASS" : "FAIL", `HTTP ${webhook.status} (want 401)`);
    } catch (error) {
      check("bot endpoints", "FAIL", error instanceof Error ? error.message : "network");
    }
  }

  if (!zammad) {
    check("zammad reachability", "BLOCKED", "ZAMMAD_BASE_URL not set");
  } else {
    try {
      const ping = await fetch(`${zammad}/api/v1/ping`);
      check("zammad reachability", ping.ok ? "PASS" : "FAIL", `HTTP ${ping.status}`);
    } catch (error) {
      check("zammad reachability", "FAIL", error instanceof Error ? error.message : "network");
    }
  }

  if (!process.env.DATABASE_URL) {
    check("channel binding + runtime posture", "BLOCKED", "DATABASE_URL not set");
  } else {
    const database = createDatabase(process.env.DATABASE_URL);
    try {
      const bindings = await new PostgresChannelBindingRepository(database).list();
      const main = bindings.find((b) => b.phoneE164 === "+6285282141733");
      check("channel binding +6285282141733", main ? "PASS" : "BLOCKED", main ? `status=${main.status}` : "not registered via POST /ops/whatsapp/channel/register");
      const runtime = await new PostgresRuntimeConfigRepository(database).getSnapshot();
      check("customer AI stays deterministic", runtime.aiAssistEnabled ? "FAIL" : "PASS", `aiAssistEnabled=${runtime.aiAssistEnabled} (must be false)`);
      check("ops AI policy", runtime.opsAIEnabled ? "PASS" : "BLOCKED", `opsAIEnabled=${runtime.opsAIEnabled}`);
      const counts = await new PostgresAssistantOutboxRepository(database).counts();
      const lag = counts.filter((r) => ["pending", "retry", "delivering"].includes(r.status)).reduce((n, r) => n + r.count, 0);
      check("assistant outbox queue lag", lag < 100 ? "PASS" : "WARN", `${lag} in flight`);
    } finally {
      await closeDatabase(database);
    }
  }

  check("ops AI provider configuration", createOpsAIProviderFromEnv().name === "throwing" ? "BLOCKED" : "PASS", `provider=${createOpsAIProviderFromEnv().name}`);

  const failed = results.filter((r) => r.status === "FAIL");
  console.log(`\n${failed.length === 0 ? "ALL CHECKS PASS/BLOCKED (no FAIL)" : `${failed.length} CHECK(S) FAILED`}`);
  console.log("Owner manual step remaining: physical round-trip from your phone (runbook TAHAP 7.3).");
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => { console.error(error); process.exit(1); });
