import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import postgres from "postgres";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../migrations");
const databaseUrl = process.env.DATABASE_URL;

async function applyMigrations(sql, throughFile) {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  const applied = new Set((await sql`SELECT version FROM schema_migrations`).map((row) => row.version));
  const files = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    if (throughFile && file > throughFile) break;
    if (applied.has(file)) continue;
    const body = readFileSync(join(migrationsDir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO schema_migrations (version) VALUES (${file})`;
    });
  }
}

async function assertFlowTables(sql) {
  const state = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'conversation_flow_state'
    ORDER BY column_name
  `;
  assert.ok(state.some((row) => row.column_name === "context_jsonb"));
  assert.ok(state.some((row) => row.column_name === "fallback_count"));

  const events = await sql`
    SELECT 1 FROM information_schema.tables WHERE table_name = 'conversation_flow_events'
  `;
  assert.equal(events.length, 1);

  const uniqueIndex = await sql`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'conversation_flow_state'
      AND indexname = 'conversation_flow_state_provider_thread'
  `;
  assert.equal(uniqueIndex.length, 1);
}

test("migration 0005 fresh database creates flow tables", { skip: !databaseUrl }, async () => {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    await applyMigrations(sql);
    await assertFlowTables(sql);
  } finally {
    await sql.end();
  }
});

test("migration 0005 upgrade preserves existing assistant data", { skip: !databaseUrl }, async () => {
  const sql = postgres(databaseUrl, { max: 1 });
  const threadId = `upgrade-proof-${Date.now()}`;
  const now = new Date().toISOString();
  try {
    await sql`DROP SCHEMA public CASCADE`;
    await sql`CREATE SCHEMA public`;
    await applyMigrations(sql, "0004_m4_zammad_provider.sql");
    await sql`
      INSERT INTO conversation_sessions (
        id, provider, provider_thread_id, provider_customer_id, provider_inbox_or_channel_id,
        chatwoot_conversation_id, chatwoot_contact_id, inbox_id,
        state, last_activity_at, created_at, updated_at
      ) VALUES (
        ${`sess-${threadId}`}, 'zammad', ${threadId}, 'cust-1', 'inbox-1',
        ${threadId}, 'cust-1', 'inbox-1',
        'BOT_ACTIVE', ${now}, ${now}, ${now}
      )
    `;
    await applyMigrations(sql);
    const sessions = await sql`
      SELECT state FROM conversation_sessions WHERE provider_thread_id = ${threadId}
    `;
    assert.equal(sessions[0]?.state, "BOT_ACTIVE");
    await assertFlowTables(sql);
  } finally {
    await sql.end();
  }
});
